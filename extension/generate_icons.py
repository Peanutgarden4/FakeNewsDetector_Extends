import os
import zlib
import struct

def create_png_bytes(width, height, color):
    """Generates bytes for a simple solid-color PNG with a border."""
    r, g, b = color
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
    
    # IDAT chunk (pixel data)
    # Scanline format: filter byte (0) followed by RGB pixels
    row = b'\x00' + bytes([r, g, b] * width)
    # We can draw a simple shield shape or 'V' letter in the middle
    pixel_rows = []
    for y in range(height):
        # Draw a V-like shape or simple emblem
        row_bytes = bytearray([0])
        for x in range(width):
            # Check if coordinates are inside a margin
            is_border = x == 0 or x == width-1 or y == 0 or y == height-1
            # Shield symbol
            is_emblem = False
            # simple 'V' mark
            cx = width / 2
            cy = height / 2
            if abs(x - cx) < width / 4 and y > height / 4 and y < height * 3 / 4:
                # simple symbol logic
                is_emblem = (abs(x - cx) * 1.5 < (y - height/4)) or (abs(x - cx) < 2)
            
            if is_border:
                row_bytes.extend([30, 41, 59]) # dark navy border
            elif is_emblem:
                row_bytes.extend([99, 102, 241]) # Indigo accent
            else:
                row_bytes.extend([16, 185, 129]) # Emerald green background
        pixel_rows.append(bytes(row_bytes))
        
    raw_data = b''.join(pixel_rows)
    compressed = zlib.compress(raw_data)
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed))
    
    # IEND chunk
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    return png

def main():
    icons_dir = '/Users/user/Desktop/technologia/extension/icons'
    os.makedirs(icons_dir, exist_ok=True)
    
    sizes = [16, 48, 128]
    # Elegant mint green & indigo scheme
    for size in sizes:
        png_bytes = create_png_bytes(size, size, (16, 185, 129))
        with open(os.path.join(icons_dir, f'icon{size}.png'), 'wb') as f:
            f.write(png_bytes)
    print("Icons successfully created.")

if __name__ == '__main__':
    main()
