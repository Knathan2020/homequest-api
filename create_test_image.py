#!/usr/bin/env python3
import cv2
import numpy as np

# Create a simple floor plan
img = np.ones((600, 800, 3), dtype=np.uint8) * 255  # White background

# Draw exterior walls
cv2.rectangle(img, (50, 50), (750, 550), (0, 0, 0), 3)

# Draw interior walls to create rooms
cv2.line(img, (400, 50), (400, 550), (0, 0, 0), 2)  # Vertical divider
cv2.line(img, (50, 300), (750, 300), (0, 0, 0), 2)  # Horizontal divider

# Add dimension text
cv2.putText(img, '30 ft', (375, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (100, 100, 100), 2)
cv2.putText(img, '25 ft', (15, 300), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (100, 100, 100), 2)

# Add room labels
cv2.putText(img, 'Living Room', (150, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (80, 80, 80), 2)
cv2.putText(img, 'Kitchen', (500, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (80, 80, 80), 2)
cv2.putText(img, 'Bedroom', (150, 425), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (80, 80, 80), 2)
cv2.putText(img, 'Bathroom', (500, 425), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (80, 80, 80), 2)

cv2.imwrite('/tmp/test_floor_plan.png', img)
print('✅ Test floor plan created at /tmp/test_floor_plan.png')