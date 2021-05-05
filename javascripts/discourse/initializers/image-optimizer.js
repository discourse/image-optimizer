import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "image-optimizer",

  initialize(container) {
    const optimizer = async function (file, reference) {
      let encoderModuleOverrides = {
        locateFile: function (path) {
          return Discourse.BaseUrl + settings.theme_uploads.wasm_mozjpeg;
        },
        onRuntimeInitialized: function () {
          return this;
        },
      };

      let decoderModuleOverrides = {
        locateFile: function (path) {
          return Discourse.BaseUrl + settings.theme_uploads.wasm_image_loader;
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

      let arrayBuffer = await file.arrayBuffer();
      const array = new Uint8Array(arrayBuffer);

      const decoded = decoder.decode(array, array.length, 3); // 3 means RGB. PNG is 4 cuz RGBA
      let { channels, height, width } = decoder.dimensions();

      let resized;

      if (height + width > 3000) {
        var decodedClone = Uint8Array.from(decoded);
        resized = decoder.resize(
          decodedClone,
          width,
          height,
          channels,
          width / 2,
          height / 2
        );
        width = width / 2;
        height = height / 2;
      } else {
        resized = decoded;
      }

      console.log(decodedClone);
      console.log(resized);

      const result = encoder.encode(
        resized,
        width,
        height,
        channels,
        mozJpegDefaultOptions
      );
      let blob = new Blob([result], { type: "image/jpeg" });
      let optimizedFile = new File([result], `optimized_${file.name}`, {
        type: "image/jpeg",
      });
      console.log(optimizedFile);
      $(".wmd-controls").fileupload("add", {
        files: [optimizedFile],
      });

      // clean up memory, when loader is not needed anymore
      decoder.free();
      encoder.free();
    };

    withPluginApi("0.8.24", (api) => {
      api.addComposerUploadHandler(["jpg"], function (file, reference) {
        if (file.name.startsWith("optimized_")) {
          return true;
        }
        console.log("Handling upload for", file.name);
        optimizer(file, reference);
        return false;
      });
    });
  },
};
