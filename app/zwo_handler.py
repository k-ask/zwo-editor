import xml.etree.ElementTree as ET
from app.models import Workout, WorkoutMetadata, WorkoutSegment
from typing import List

def parse_zwo(xml_content: str) -> Workout:
    root = ET.fromstring(xml_content)
    
    # Parse Metadata
    name = root.find("name").text if root.find("name") is not None else "Unknown Workout"
    description = root.find("description").text if root.find("description") is not None else ""
    author = root.find("author").text if root.find("author") is not None else ""
    sport_type = root.find("sportType").text if root.find("sportType") is not None else "bike"
    
    tags_elem = root.find("tags")
    tags = []
    if tags_elem is not None:
        for tag in tags_elem.findall("tag"):
            if tag.attrib.get("name"):
                tags.append(tag.attrib.get("name"))

    metadata = WorkoutMetadata(
        name=name,
        description=description,
        author=author,
        sport_type=sport_type,
        tags=tags
    )

    # Parse Segments
    workout_elem = root.find("workout")
    segments = []
    
    if workout_elem is not None:
        for child in workout_elem:
            tag = child.tag
            attrib = child.attrib
            
            # Common attributes
            duration = int(attrib.get("Duration", 0))
            
            segment_data = {"duration": duration, "text": xml_content} # temporary placeholder content
            
            if tag == "Warmup":
                segments.append(WorkoutSegment(
                    type="Warmup",
                    duration=duration,
                    power_low=float(attrib.get("PowerLow", 0)),
                    power_high=float(attrib.get("PowerHigh", 0))
                ))
            elif tag == "CoolDown":
                segments.append(WorkoutSegment(
                    type="CoolDown",
                    duration=duration,
                    power_low=float(attrib.get("PowerLow", 0)),
                    power_high=float(attrib.get("PowerHigh", 0))
                ))
            elif tag == "SteadyState":
                segments.append(WorkoutSegment(
                    type="SteadyState",
                    duration=duration,
                    power=float(attrib.get("Power", 0))
                ))
            elif tag == "IntervalsT":
                segments.append(WorkoutSegment(
                    type="IntervalsT",
                    duration=0, # Calculated from repeat * (on + off) usually, but ZWO doesn't store total duration on the tag
                    repeat=int(attrib.get("Repeat", 1)),
                    on_duration=int(attrib.get("OnDuration", 0)),
                    off_duration=int(attrib.get("OffDuration", 0)),
                    on_power=float(attrib.get("OnPower", 0)),
                    off_power=float(attrib.get("OffPower", 0))
                ))
            elif tag == "FreeRide":
                segments.append(WorkoutSegment(
                    type="FreeRide",
                    duration=duration
                ))
            elif tag == "Ramp":
                 segments.append(WorkoutSegment(
                    type="Ramp",
                    duration=duration,
                    power_low=float(attrib.get("PowerLow", 0)),
                    power_high=float(attrib.get("PowerHigh", 0))
                ))
            elif tag == "MaxEffort":
                 segments.append(WorkoutSegment(
                    type="MaxEffort",
                    duration=duration
                ))

    return Workout(metadata=metadata, segments=segments)


def generate_zwo(workout: Workout) -> str:
    root = ET.Element("workout_file")
    
    # Metadata
    ET.SubElement(root, "author").text = workout.metadata.author
    ET.SubElement(root, "name").text = workout.metadata.name
    ET.SubElement(root, "description").text = workout.metadata.description
    ET.SubElement(root, "sportType").text = workout.metadata.sport_type
    
    tags_elem = ET.SubElement(root, "tags")
    for tag in workout.metadata.tags:
        ET.SubElement(tags_elem, "tag", name=tag)

    workout_data_elem = ET.SubElement(root, "workout")
    
    for seg in workout.segments:
        if seg.type == "SteadyState":
            ET.SubElement(workout_data_elem, "SteadyState", 
                          Duration=str(seg.duration), 
                          Power=str(seg.power))
        elif seg.type == "Warmup":
            ET.SubElement(workout_data_elem, "Warmup", 
                          Duration=str(seg.duration), 
                          PowerLow=str(seg.power_low), 
                          PowerHigh=str(seg.power_high))
        elif seg.type == "CoolDown":
            ET.SubElement(workout_data_elem, "CoolDown", 
                          Duration=str(seg.duration), 
                          PowerLow=str(seg.power_low), 
                          PowerHigh=str(seg.power_high))
        elif seg.type == "Ramp":
            ET.SubElement(workout_data_elem, "Ramp", 
                          Duration=str(seg.duration), 
                          PowerLow=str(seg.power_low), 
                          PowerHigh=str(seg.power_high))
        elif seg.type == "IntervalsT":
            ET.SubElement(workout_data_elem, "IntervalsT", 
                          Repeat=str(seg.repeat),
                          OnDuration=str(seg.on_duration),
                          OffDuration=str(seg.off_duration),
                          OnPower=str(seg.on_power),
                          OffPower=str(seg.off_power))
        elif seg.type == "FreeRide":
            ET.SubElement(workout_data_elem, "FreeRide", 
                          Duration=str(seg.duration))
        elif seg.type == "MaxEffort":
            ET.SubElement(workout_data_elem, "MaxEffort", 
                          Duration=str(seg.duration))
            
    # Indent for pretty printing? ElementTree doesn't support it natively well without simple hacks or library
    # Simple hack
    _indent(root)
    return ET.tostring(root, encoding="utf-8", method="xml").decode("utf-8")

def _indent(elem, level=0):
    i = "\n" + level*"  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = i + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = i
        for child in elem:
            _indent(child, level+1)
        child.tail = i
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = i
