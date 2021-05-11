async function optimize(arrayBuffer, file_name, settings) {
  let encoderModuleOverrides = {
    locateFile: function (path) {
      return settings.wasm_mozjpeg_wasm;
    },
    onRuntimeInitialized: function () {
      return this;
    },
  };

  let decoderModuleOverrides = {
    locateFile: function (path) {
      return settings.wasm_image_loader_wasm;
    },
    onRuntimeInitialized: function () {
      return this;
    },
  };
  let decoder = await wasm_image_loader(decoderModuleOverrides);
  let encoder = await wasm_mozjpeg(encoderModuleOverrides);

  const mozJpegDefaultOptions = {
    quality: 75,
    baseline: false,
    arithmetic: false,
    progressive: true,
    optimize_coding: true,
    smoothing: 0,
    in_color_space: 2, // J_COLOR_SPACE.JCS_RGB
    out_color_space: 3, // J_COLOR_SPACE.JCS_YCbCr
    quant_table: 3,
    trellis_multipass: false,
    trellis_opt_zero: false,
    trellis_opt_table: false,
    trellis_loops: 1,
    auto_subsample: true,
    chroma_subsample: 2,
    separate_chroma_quality: false,
    chroma_quality: 75,
  };

  const array = new Uint8Array(arrayBuffer);

  console.log(`Worker received ArrayBuffer: ${arrayBuffer.byteLength}`);
  const decoded = decoder.decode(array, array.length, 0); // 3 means RGB. PNG is 4 cuz RGBA
  console.log(`Worker decoded: ${decoded.byteLength}`);
  let { channels, height, width } = decoder.dimensions();
  console.log(`Detected Image Height: ${height}`);
  console.log(`Detected Image Width: ${width}`);

  let resized;

  if (settings.enable_resize && width > settings.resize_width_threshold) {
    const newWidth = settings.resize_width_threshold;
    const newHeight = height / (width / newWidth);

    var decodedClone = Uint8Array.from(decoded); // decoded is allocated from WASM and the .resize method will free it, so we need to copy by value
    resized = decoder.resize(
      decodedClone,
      width,
      height,
      channels,
      newWidth,
      newHeight
    );
    width = newWidth;
    height = newHeight;
    decoder.free();
  } else {
    resized = decoded;
  }

  console.log(`Worker post resize file: ${resized.byteLength}`);

  const result = encoder.encode(
    resized,
    width,
    height,
    channels,
    mozJpegDefaultOptions
  );

  console.log(`Worker post reencode file: ${result.byteLength}`);

  let transferrable = Uint8Array.from(result).buffer; // decoded was allocated inside WASM so it can be transfered to another context, need to copy by value

  // free internal references
  decoder.free();
  encoder.free();

  return transferrable;
}

onmessage = async function (e) {
  console.log("Worker: Message received from main script");
  console.log(e);

  switch (e.data.type) {
    case "install":
      console.log(e.data.list);
      importScripts(...e.data.list);
      postMessage({
        type: "ready",
      });
      break;
    case "compress":
      try {
        let optimized = await optimize(
          e.data.file,
          e.data.file_name,
          e.data.settings
        );
        postMessage(
          {
            type: "file",
            file: optimized,
          },
          [optimized]
        );
      } catch (error) {
        console.error(error);
        postMessage({
          type: "error",
        });
      }
      break;
    default:
      console.log(`Sorry, we are out of ${e}.`);
  }
};
