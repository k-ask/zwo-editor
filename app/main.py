from fastapi import FastAPI, Request, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, Response
from app.models import Workout
from app.zwo_handler import parse_zwo, generate_zwo
import os

app = FastAPI(title="Zwift Workout Editor")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/generate-zwo")
async def create_zwo(workout: Workout):
    try:
        xml_content = generate_zwo(workout)
        return Response(content=xml_content, media_type="application/xml")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse-zwo")
async def parse_zwo_endpoint(file: UploadFile = File(...)):
    if not file.filename.endswith('.zwo'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .zwo file.")
    
    try:
        content = await file.read()
        workout = parse_zwo(content.decode('utf-8'))
        return workout
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse ZWO file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
