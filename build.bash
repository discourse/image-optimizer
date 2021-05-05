#!/bin/bash
set -ueE -o pipefail

echo '<script>' > common/header.html
cat node_modules/@saschazar/wasm-image-loader/wasm_image_loader.js >> common/header.html
echo "</script>" >> common/header.html
echo '<script>' >> common/header.html
cat node_modules/@saschazar/wasm-mozjpeg/wasm_mozjpeg.js >> common/header.html
echo "</script>" >> common/header.html
cp node_modules/@saschazar/wasm-image-loader/wasm_image_loader.wasm assets/
cp node_modules/@saschazar/wasm-mozjpeg/wasm_mozjpeg.wasm assets/
cp node_modules/@saschazar/wasm-image-loader/wasm_image_loader.js assets/
cp node_modules/@saschazar/wasm-mozjpeg/wasm_mozjpeg.js assets/
