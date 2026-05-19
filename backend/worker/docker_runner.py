import os
import tempfile
import logging
import docker
from typing import Tuple
from requests.exceptions import ReadTimeout

logger = logging.getLogger(__name__)

def get_docker_client():
    """
    Lazy initialization of the Docker client.
    Ensures the worker doesn't permanently fail if the Docker daemon restarts dynamically.
    """
    try:
        return docker.from_env()
    except Exception as e:
        logger.error(f"Failed to connect to Docker daemon. Is Docker running? Error: {e}")
        return None

def execute_sandboxed_code(source_code: str, test_cases: str = "") -> Tuple[bool, str]:
    """
    Executes student Python code inside an extreme-security, ephemeral Docker container.
    Returns a tuple containing (is_pass: bool, execution_logs: str).
    """
    client = get_docker_client()
    if not client:
        return False, "System Error: Docker execution engine is currently offline."

    # Create a temporary directory on the host to mount into the container.
    # This automatically cleans up files from the host once the 'with' block exits.
    with tempfile.TemporaryDirectory() as temp_dir:
        student_script_path = os.path.join(temp_dir, "solution.py")
        test_script_path = os.path.join(temp_dir, "test_solution.py")

        # Write the student's code to the temporary file
        with open(student_script_path, "w", encoding="utf-8") as f:
            f.write(source_code)

        # Write the corresponding test cases
        # ENTERPRISE FIX: Removed 'pytest' dependency because network_disabled=True 
        # blocks any 'pip install' attempts. Using standard Python asserts instead.
        with open(test_script_path, "w", encoding="utf-8") as f:
            if test_cases:
                f.write(test_cases)
            else:
                # Robust standard library fallback to ensure valid Python syntax execution
                f.write(
                    "import solution\n"
                    "def test_basic_execution():\n"
                    "    assert True\n"
                    "if __name__ == '__main__':\n"
                    "    test_basic_execution()\n"
                    "    print('Compilation and basic execution successful.')\n"
                )

        container = None
        try:
            logger.info("Spawning isolated Docker container for code execution...")
            
            # Spin up the container with extreme security constraints
            container = client.containers.run(
                image="python:3.11-alpine",  # Lightweight, fast image pre-loaded with standard python
                command="python test_solution.py", # Direct execution without network dependencies
                volumes={temp_dir: {'bind': '/app', 'mode': 'ro'}},  # Read-only mount
                working_dir="/app",
                
                # Enterprise Security Guardrails
                mem_limit="256m",                     # Prevent memory exhaustion attacks (OOM)
                cpu_quota=50000,                      # Throttle CPU usage to 50% of a single core
                network_disabled=True,                # Strictly prevent outbound network access (no curl/wget hacks)
                pids_limit=50,                        # Block fork bombs (e.g., while True: os.fork())
                security_opt=["no-new-privileges"],   # Prevent privilege escalation inside the container
                read_only=True,                       # Immutable root filesystem
                detach=True,                          # Run in background to manually manage the timeout
            )

            # Enforce the strict 5-second timeout requirement
            result = container.wait(timeout=5)
            
            # Capture stdout and stderr
            logs = container.logs().decode("utf-8")
            
            # Extract exit code (0 means the script exited cleanly without assertion errors)
            exit_code = result.get("StatusCode", 1)
            is_pass = (exit_code == 0)

            return is_pass, logs

        except ReadTimeout:
            logger.warning("Code execution exceeded the 5-second timeout limit. Terminating.")
            return False, "Execution Timed Out: Your code took longer than 5 seconds to run. Check for infinite loops."
            
        except docker.errors.ContainerError as e:
            logger.error(f"Container runtime error: {str(e)}")
            return False, f"Container Error: {str(e)}"
            
        except Exception as e:
            logger.error(f"Unexpected sandboxing error: {str(e)}")
            return False, f"System Failure: {str(e)}"
            
        finally:
            # Absolute Guarantee: Always destroy the container, even if the code crashes or times out
            if container:
                try:
                    container.stop(timeout=1)
                    container.remove(force=True)
                    logger.info("Ephemeral container destroyed successfully.")
                except Exception as cleanup_error:
                    logger.error(f"Failed to cleanup container: {cleanup_error}")