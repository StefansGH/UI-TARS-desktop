'''

'''
from pynput.mouse import Controller, Listener
import os
import json
import subprocess
import zlib
from datetime import datetime
from mss.darwin import MSS as mss
from PIL import Image
import time


class ComputerController:
    """Simple controller for mouse tracking and screenshot capture."""
    
    def __init__(self, output_dir, screenshot_dir, screenshot_interval, monitor_id):
        """Initialize the mouse controller.
        
        Args:
            output_dir (str): Directory where click data will be saved
            screenshot_dir (str): Directory where screenshots will be saved
            screenshot_interval (float): Interval between screenshots in seconds
            monitor_id (int): ID of the monitor to capture screenshots from
        """
        self.mouse = Controller()
        self.clicked = False
        
        # Initialize MSS for screenshots
        self.sct = mss()
        # Compression level (0-9, where 9 is maximum compression)
        self.compression_level = 9
        
        self.output_dir = output_dir
        self.screenshot_dir = screenshot_dir
        self.screenshot_interval = screenshot_interval
        self.last_screenshot_time = 0
        self.monitor_id = monitor_id
        
        # Create directories if they don't exist
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.screenshot_dir, exist_ok=True)
        
        # Set up the mouse listener
        self.listener = Listener(on_click=self._on_click)
        self.listener.start()
    
    def get_mouse_position(self):
        """Get the current mouse position.
        
        Returns:
            tuple: (x, y) coordinates of the mouse pointer
        """
        return self.mouse.position
    
    def _on_click(self, x, y, button, pressed):
        """Handle mouse click events.
        
        Args:
            x (int): X coordinate of the click
            y (int): Y coordinate of the click
            button: The button that was clicked
            pressed (bool): Whether the button was pressed or released
        """
        # Check if it's the left button and it was pressed
        if button.name == 'left' and pressed:
            self.clicked = True
            
            # Rename the latest screenshot with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            new_screenshot_path = os.path.join(self.screenshot_dir, f"screenshot_{timestamp}.jpg")
            
            # Try to rename the generic screenshot file if it exists
            generic_screenshot_path = os.path.join(self.screenshot_dir, "screenshot.jpg")
            if os.path.exists(generic_screenshot_path):
                try:
                    os.rename(generic_screenshot_path, new_screenshot_path)
                    # Save the click with the new screenshot path
                    self.save_click_data(x, y, new_screenshot_path)
                except OSError as e:
                    print(f"Error renaming screenshot: {e}")
                    # If renaming fails, save click with the generic path
                    self.save_click_data(x, y, generic_screenshot_path)
            else:
                # If no screenshot exists, just save the click
                self.save_click_data(x, y)
    
    def save_click_data(self, x, y, screenshot_path):
        example = {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Where to click? Answer with coordinates only (e.g., 1111.1111,2222.2222)"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": screenshot_path
                            }
                        }
                    ]
                },
                {
                    "role": "assistant",
                    "content": f"{x},{y}"
                }
            ]
        }
        
        timestamp = int(time.time() * 1000)
        output_file = os.path.join(self.output_dir, f"example_{timestamp}.json")
        with open(output_file, "w") as f:
            json.dump(example, f, indent=2)
    
    def was_clicked(self):
        """Check if the left mouse button was clicked.
        
        Returns:
            bool: True if the left button was clicked since the last check
        """
        if self.clicked:
            self.clicked = False
            return True
        return False
    
    def take_screenshot(self):
        """Take a screenshot of the specified monitor using MSS and save it as a compressed JPEG.
        
        Returns:
            str: Path to the saved screenshot, or None if failed
        """
        try:
            # Save with a generic name - will be renamed on click
            screenshot_path = os.path.join(self.screenshot_dir, "screenshot.png")
            
            # Use MSS to capture the screen
            with self.sct as sct:
                # Capture the specified monitor
                sct_img = sct.grab(sct.monitors[self.monitor_id])
                
                # Convert to PIL Image
                img = Image.frombytes("RGB", (sct_img.width, sct_img.height), sct_img.rgb)
                
                # Resize to reduce quality (optional)
                # Reduce the image size by 50%
                new_width = sct_img.width // 2
                new_height = sct_img.height // 2
                img = img.resize((new_width, new_height), Image.LANCZOS)
                
                # Save as JPEG with low quality for maximum compression
                # Change extension to .jpg
                screenshot_path = os.path.join(self.screenshot_dir, "screenshot.jpg")
                img.save(screenshot_path, format="JPEG", quality=30, optimize=True)
                
            return screenshot_path
        except Exception as e:
            print(f"Error taking screenshot: {e}")
            return None
    
    def should_take_screenshot(self, current_time):
        """Check if it's time to take a screenshot based on the interval.
        
        Args:
            current_time (float): Current time in seconds
            
        Returns:
            bool: True if it's time to take a screenshot
        """
        return current_time - self.last_screenshot_time >= self.screenshot_interval
    
    def update_screenshot_time(self, current_time):
        """Update the last screenshot time.
        
        Args:
            current_time (float): Current time in seconds
        """
        self.last_screenshot_time = current_time
    