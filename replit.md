# Generador de Fixtures Deportivos

## Overview
A sports fixture/schedule generator web application built with Flask (Python). Users can import teams from CSV files, configure tournament parameters, and generate match schedules with PDF export capability.

## Project Structure
```
/
├── app.py                 # Flask server - main entry point
├── fixture_generator.py   # Core fixture generation logic
├── templates/             # Static frontend files
│   ├── index.html         # Main HTML page
│   ├── styles.css         # Stylesheet
│   └── script.js          # Frontend JavaScript
└── requirements.txt       # Python dependencies
```

## Running the Application
The Flask server runs on port 5000 and serves both the API and static frontend files.

```bash
python app.py
```

## API Endpoints
- `GET /` - Serves the main HTML page
- `POST /import_teams` - Import teams from CSV file (multipart/form-data)
- `POST /generate` - Generate complete fixture with schedule
- `POST /generate_parts` - Generate timeslots and matches separately (for drag-and-drop UI)
- `GET /export_pdf` - Export generated fixture to PDF

## Dependencies
- Flask - Web framework
- pandas - Data manipulation
- python-dateutil - Date parsing
- fpdf2 - PDF generation

## CSV Format
The expected CSV format for team import:
```
Zona;Equipos
A;Team1
A;Team2
B;Team3
```

## Tournament Systems
- `rr` - Round Robin (all vs all)
- `8x3` - 8 zones of 3 teams (24 teams total)
- `4x6` - 4 zones of 6 teams (24 teams total)
