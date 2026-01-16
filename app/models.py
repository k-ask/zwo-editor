from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Union

class WorkoutSegment(BaseModel):
    # Common fields
    type: Literal["Warmup", "SteadyState", "IntervalsT", "Ramp", "CoolDown", "FreeRide", "MaxEffort"]
    duration: int  # in seconds
    
    # Power can be relative (0.0 - 2.0+) or absolute watts (usually handled by client, but ZWO stores relative mostly)
    # ZWO usually uses 'Power' attribute relative to FTP (e.g. 0.75)
    
    # For SteadyState, Warmup, CoolDown
    power_low: Optional[float] = None # For ramps (Warmup/CoolDown)
    power_high: Optional[float] = None # For ramps
    power: Optional[float] = None # For SteadyState
    
    # For Intervals (IntervalsT)
    on_duration: Optional[int] = None
    off_duration: Optional[int] = None
    on_power: Optional[float] = None
    off_power: Optional[float] = None
    repeat: Optional[int] = None
    
    # Text events (cadence etc can be added later, keeping simple for now)
    text: Optional[str] = None

class WorkoutMetadata(BaseModel):
    name: str
    description: Optional[str] = ""
    author: Optional[str] = "Antigravity Editor"
    sport_type: str = "bike"
    tags: List[str] = []

class Workout(BaseModel):
    metadata: WorkoutMetadata
    segments: List[WorkoutSegment]
