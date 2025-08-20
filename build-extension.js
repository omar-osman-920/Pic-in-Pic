import fs from 'fs';
import path from 'path';

// Create dist directory if it doesn't exist
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy extension files to dist
const filesToCopy = [
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css'
];

filesToCopy.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join('dist', file));
    console.log(`Copied ${file} to dist/`);
  } else {
    console.warn(`Warning: ${file} not found`);
  }
});

// Copy icons directory
if (fs.existsSync('icons')) {
  if (!fs.existsSync('dist/icons')) {
    fs.mkdirSync('dist/icons');
  }
  
  const iconFiles = fs.readdirSync('icons');
  iconFiles.forEach(file => {
    fs.copyFileSync(path.join('icons', file), path.join('dist/icons', file));
    console.log(`Copied icons/${file} to dist/icons/`);
  });
}

console.log('Extension build complete! Load the dist/ folder in Chrome.');