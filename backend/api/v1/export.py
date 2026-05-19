import io
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

# Enterprise PDF Generation Library (Requires: pip install reportlab)
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from db.session import get_db
from models.user import User
from models.roadmap import Roadmap, TaskStatus
from api.v1.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/export", tags=["Study Plan Export"])

async def _get_active_roadmap(db: AsyncSession, user_id: str) -> Roadmap:
    """
    Helper function to securely fetch the active roadmap for the requesting user.
    Uses highly optimized eager loading for tasks to prevent N+1 query problems.
    """
    stmt = (
        select(Roadmap)
        .options(selectinload(Roadmap.tasks))
        .where(
            Roadmap.student_id == user_id,
            Roadmap.is_active == True
        )
        .order_by(Roadmap.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    roadmap = result.scalars().first()

    if not roadmap:
        logger.warning(f"Export failed: No active roadmap found for user {user_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You do not have an active study plan to export."
        )
    return roadmap


@router.get("/ics")
async def export_roadmap_ics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generates an iCalendar (.ics) file dynamically based on the student's active roadmap.
    Allows students to sync their curriculum tasks directly with Google Calendar, Outlook, or Apple Calendar.
    """
    roadmap = await _get_active_roadmap(db, current_user.id)
    
    # Standard RFC 5545 iCalendar initialization
    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Personalized Curriculum Generator//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:My Study Plan",
        "X-WR-TIMEZONE:UTC"
    ]

    # Dynamically schedule tasks day-by-day starting from the roadmap creation date
    current_date = roadmap.created_at or datetime.now(timezone.utc)
    
    for index, task in enumerate(roadmap.tasks):
        # Format dates for ICS specification (YYYYMMDDTHHMMSSZ)
        dtstart = current_date.strftime("%Y%m%dT090000Z")  # Assume 9 AM start time
        dtend = (current_date + timedelta(hours=2)).strftime("%Y%m%dT110000Z") # Assume 2 hours per task
        dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        
        # Clean up description to avoid multi-line breaks in ICS
        safe_description = (task.description or "No description provided.").replace("\n", " ").replace("\r", "")

        ics_lines.extend([
            "BEGIN:VEVENT",
            f"UID:task-{task.id}@curriculum.local",
            f"DTSTAMP:{dtstamp}",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:{task.title} ({task.task_type.value})",
            f"DESCRIPTION:{safe_description}",
            f"STATUS:{'CONFIRMED' if task.status == TaskStatus.COMPLETED else 'TENTATIVE'}",
            "END:VEVENT"
        ])
        
        # Increment day for the next task
        current_date += timedelta(days=1)

    ics_lines.append("END:VCALENDAR")
    
    # Construct the final raw string
    ics_content = "\r\n".join(ics_lines)

    logger.info(f"Successfully generated ICS export for user {current_user.id}")
    
    # Return as a downloadable file via HTTP Response
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={"Content-Disposition": f"attachment; filename=study_plan_{roadmap.id}.ics"}
    )


@router.get("/pdf")
async def export_roadmap_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generates a professional, structured PDF document of the student's curriculum.
    Includes milestone progress, task types, and completion statuses.
    """
    roadmap = await _get_active_roadmap(db, current_user.id)
    
    # Initialize the in-memory byte stream for the PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=18)
    elements = []
    
    styles = getSampleStyleSheet()
    title_style = styles['Heading1']
    title_style.alignment = 1 # Center alignment
    
    # Document Header
    target_domain = roadmap.content.get("target_domain", "Custom Study Plan")
    elements.append(Paragraph(f"Curriculum Export: {target_domain}", title_style))
    elements.append(Spacer(1, 12))
    
    elements.append(Paragraph(f"<b>Student:</b> {current_user.email}", styles['Normal']))
    elements.append(Paragraph(f"<b>Generated On:</b> {roadmap.created_at.strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    elements.append(Spacer(1, 24))
    
    # Build the Data Table for Tasks
    table_data = [["Sequence", "Task Title", "Type", "Current Status"]]
    
    for index, task in enumerate(roadmap.tasks):
        # Add tasks to the table data
        table_data.append([
            str(index + 1),
            Paragraph(task.title, styles['Normal']),
            task.task_type.value,
            task.status.value
        ])
        
    # Table Styling
    pdf_table = Table(table_data, colWidths=[60, 250, 100, 120])
    pdf_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2C3E50")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#F8F9FA")),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor("#DDDDDD")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    
    elements.append(pdf_table)
    
    # Build the PDF document
    try:
        doc.build(elements)
    except Exception as e:
        logger.error(f"PDF compilation failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate the PDF document.")
        
    buffer.seek(0)
    
    logger.info(f"Successfully generated PDF export for user {current_user.id}")
    
    # Stream the PDF directly to the client
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=study_plan_{roadmap.id}.pdf"}
    )