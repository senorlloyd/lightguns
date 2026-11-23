#!/bin/sh
# Rebuilds ../game.js and ../assets.js from main.js + the files in this folder.
# Needs Node.js. First time:  npm install
set -e
cd "$(dirname "$0")"
node -e "
const fs=require('fs');const rd=(d,ext)=>Object.fromEntries(fs.readdirSync(d).filter(f=>f.endsWith(ext)).map(f=>[f.replace(ext,''),fs.readFileSync(d+'/'+f).toString('base64')]));
fs.writeFileSync('../assets.js','window.HOG_LOGO='+JSON.stringify(fs.readFileSync('logo.png').toString('base64'))+';\nwindow.HOG_ASSETS='+JSON.stringify(rd('models','.glb'))+';\nwindow.HOG_TEX='+JSON.stringify(rd('tex','.jpg'))+';\nwindow.HOG_AUDIO='+JSON.stringify(rd('audio','.ogg'))+';')"
npx esbuild main.js --bundle --format=iife --minify --target=es2020 --outfile=../game.js --log-level=warning
echo "built ../game.js and ../assets.js"
