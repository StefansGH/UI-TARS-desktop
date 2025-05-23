'''

'''
import time
import os
from computer import ComputerController
from dotenv import load_dotenv

def main():
    """Track and save mouse coordinates to JSON when left button is clicked and take screenshots."""
    # Load environment variables
    load_dotenv()
    
    # Get monitor ID from environment variable (default to 2 if not set)
    monitor_id = int(os.getenv("MONITOR_ID", 2))
    
    # Initialize the computer controller with the output file and screenshot settings
    controller = ComputerController(
        output_dir="data/text",
        screenshot_dir="data/images",
        screenshot_interval=0.5,  # 2 screenshots per second
        monitor_id=monitor_id
    )
    
    print("Tracking mouse clicks and taking screenshots. Press Ctrl+C to exit.")
    try:
        while True:
            current_time = time.time()
            
            # Check if it's time to take a screenshot
            if controller.should_take_screenshot(current_time):
                screenshot_path = controller.take_screenshot()
                if screenshot_path:
                    controller.update_screenshot_time(current_time)
            
            # Check if the mouse was clicked
            if controller.was_clicked():
                # Get current mouse position
                x, y = controller.get_mouse_position()
                print(f"Click recorded at coordinates: {x}, {y}")
            
            # Small delay to prevent high CPU usage
            time.sleep(0.01)
    except KeyboardInterrupt:
        print("\nMouse tracking and screenshot capture stopped.")

if __name__ == "__main__":
    main()
