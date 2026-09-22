use ico::{IconDir, IconDirEntry, IconImage, ResourceType};
use std::{fs, fs::File, path::Path};

fn main() {
  ensure_windows_icon();
  tauri_build::build();
}

fn ensure_windows_icon() {
  let path = Path::new("icons/icon.ico");
  if path.exists() {
    return;
  }

  fs::create_dir_all("icons").expect("failed to create icons directory");

  let mut icon = IconDir::new(ResourceType::Icon);
  for size in [32u32, 64, 128, 256] {
    let rgba = draw_h_trans_icon(size);
    let image = IconImage::from_rgba_data(size, size, rgba);
    let entry = IconDirEntry::encode(&image).expect("failed to encode H TRANS icon");
    icon.add_entry(entry);
  }

  let file = File::create(path).expect("failed to create icon.ico");
  icon.write(file).expect("failed to write icon.ico");
}

fn draw_h_trans_icon(size: u32) -> Vec<u8> {
  let mut pixels = vec![0u8; (size * size * 4) as usize];

  let set = |pixels: &mut [u8], x: i32, y: i32, color: [u8; 4]| {
    if x < 0 || y < 0 || x >= size as i32 || y >= size as i32 {
      return;
    }
    let index = ((y as u32 * size + x as u32) * 4) as usize;
    pixels[index..index + 4].copy_from_slice(&color);
  };

  let bg = [7, 24, 42, 255];
  let border = [34, 151, 255, 255];
  let blue = [24, 145, 255, 255];
  let white = [250, 253, 255, 255];

  let radius = size as f32 * 0.19;
  let inset = size as f32 * 0.055;

  for y in 0..size as i32 {
    for x in 0..size as i32 {
      let xf = x as f32;
      let yf = y as f32;
      let left = inset;
      let top = inset;
      let right = size as f32 - inset;
      let bottom = size as f32 - inset;

      let inside = if xf < left + radius && yf < top + radius {
        (xf - left - radius).powi(2) + (yf - top - radius).powi(2) <= radius.powi(2)
      } else if xf > right - radius && yf < top + radius {
        (xf - right + radius).powi(2) + (yf - top - radius).powi(2) <= radius.powi(2)
      } else if xf < left + radius && yf > bottom - radius {
        (xf - left - radius).powi(2) + (yf - bottom + radius).powi(2) <= radius.powi(2)
      } else if xf > right - radius && yf > bottom - radius {
        (xf - right + radius).powi(2) + (yf - bottom + radius).powi(2) <= radius.powi(2)
      } else {
        xf >= left && xf <= right && yf >= top && yf <= bottom
      };

      if inside {
        set(&mut pixels, x, y, bg);
      }
    }
  }

  let border_width = (size as f32 * 0.018).max(1.0) as i32;
  for i in 0..border_width {
    let p = inset as i32 + i;
    let q = size as i32 - inset as i32 - i - 1;
    for x in p..=q {
      set(&mut pixels, x, p, border);
      set(&mut pixels, x, q, border);
    }
    for y in p..=q {
      set(&mut pixels, p, y, border);
      set(&mut pixels, q, y, border);
    }
  }

  let h_left = (size as f32 * 0.32) as i32;
  let h_right = (size as f32 * 0.68) as i32;
  let h_top = (size as f32 * 0.27) as i32;
  let h_bottom = (size as f32 * 0.74) as i32;
  let stroke = (size as f32 * 0.095).max(3.0) as i32;
  let cross_top = (size as f32 * 0.455) as i32;
  let cross_bottom = (size as f32 * 0.545) as i32;

  for y in h_top..=h_bottom {
    for x in h_left..h_left + stroke {
      set(&mut pixels, x, y, blue);
    }
    for x in h_right - stroke..h_right {
      set(&mut pixels, x, y, blue);
    }
  }
  for y in cross_top..=cross_bottom {
    for x in h_left..h_right {
      set(&mut pixels, x, y, blue);
    }
  }

  let arrow_stroke = (size as f32 * 0.035).max(2.0) as i32;
  for t in 0..arrow_stroke {
    for x in (size as f32 * 0.18) as i32..(size as f32 * 0.58) as i32 {
      let nx = x as f32 / size as f32;
      let curve = 0.18 + (nx - 0.18) * 0.28;
      let y = (curve * size as f32) as i32 + t;
      set(&mut pixels, x, y, white);
    }
    for x in (size as f32 * 0.42) as i32..(size as f32 * 0.82) as i32 {
      let nx = x as f32 / size as f32;
      let curve = 0.82 - (nx - 0.42) * 0.28;
      let y = (curve * size as f32) as i32 - t;
      set(&mut pixels, x, y, white);
    }
  }

  let top_tip_x = (size as f32 * 0.64) as i32;
  let top_tip_y = (size as f32 * 0.25) as i32;
  let bottom_tip_x = (size as f32 * 0.36) as i32;
  let bottom_tip_y = (size as f32 * 0.75) as i32;
  let head = (size as f32 * 0.09) as i32;

  for dy in -head..=head {
    let width = head - dy.abs();
    for dx in 0..=width {
      set(&mut pixels, top_tip_x - dx, top_tip_y + dy, white);
      set(&mut pixels, bottom_tip_x + dx, bottom_tip_y + dy, white);
    }
  }

  pixels
}
