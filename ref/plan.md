# Implementation Plan: Recording User Activity


## Goal

Write a standalone module that records the user activity and sends it to an API.

After launching app, 
* every 200 ms a screenshots is made of the whole screen and temporarily saved in cache. Only the last screenshot taken needs to stay in cache.
* every click and keystroke is recorded and sent to the api togehter with last screenshot taken just before the click/keystroke
* after Posting this to the API, the images are removed from cache
* Sent this activity to the record-api


## Record-API

Is a simple REST API that allows a user to send:
* A screenshot image (JPG)
* An action to record (keyboard or mouse, including screenshot)

The API:
* Parses the action (including screenshot)
* Extracts metadata (like screen width/height)
* Stores the screenshot image on disk
* Stores the information as a JSON file on disk


## API Endpoint

POST /record

Payload:
* screenshot: image file via multipart/form-data
* action: JSON field

Saved under a unique ID, each entry will look like this:

{
  "id": "a94cfb3f-8a71-40ae-802a-9c8c9d1c0dcf",
  "timestamp": current_timestamp,
  "user": "human" | "machine",
  "screenshot": multipart/form-data,
  "width": 1920,
  "height": 1080,
  "action": {
    "type": "mouse", 
    "event": "click",
    "button": "left",
    "position": [800, 450]
  }
}


### Action Object Format

#### Mouse Actions

{
  "type": "mouse",
  "event": "click" | "drag" | "scroll",
  "button": "left" | "right" | "middle",
  "position": [x, y],      // required for click/drag
  "to_position": [x, y],   // required for drag
  "scroll_amount": 50      // required for scroll
}


#### Keyboard Actions

{
  "type": "keyboard",
  "event": "keystroke" | "hotkey",
  "key": "a"               // for single key
}

{
  "type": "keyboard",
  "event": "hotkey",
  "keys": ["ctrl", "c"]
}


## Reference implementations

* `PyMacroRecord` is macro recorder build in Python. It has a different purpose (record and repeat), but the recording functionality can be reused. Ignore the Linux and Windows stuff, focus on MacOS
* An old implementation in Python I build myself.
* IMPORTANT: It needs to be part of the existing Node.js application.


## Implementation Checklist

### Phase 1: Core Recording
- [x] Implement screenshot capture functionality (200ms intervals)
- [x] Create screenshot cache management (keep only latest screenshot)
- [x] Implement mouse event capture (click, drag, scroll)
- [x] Implement keyboard event capture (keystroke, hotkey combinations)
- [x] Create action object formatting functions

### Phase 2: API Integration (Mock)
- [x] **Print API request string instead of sending** (no API available yet)
- [x] Format multipart/form-data payload structure
- [x] Generate unique IDs and timestamps for each action
- [x] Extract screen metadata (width, height)
- [x] Create JSON structure for actions according to spec


## Expectations

When running the app, every mouse click and keyboard stroke is printed in the terminal.