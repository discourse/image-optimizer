import { withPluginApi } from "discourse/lib/plugin-api";
import { getURLWithCDN, getAbsoluteURL } from "discourse-common/lib/get-url";

export default {
  name: "image-optimizer",

  initialize(container) {
    function fixScriptURL(url) {
      if (url.startsWith("/")) {
        return getAbsoluteURL(url);
      } else {
        return url;
      }
    }

    withPluginApi("0.11.3", (api) => {
      api.addComposerUploadProcessor(
        { action: "optimizeJPEG" },
        {
          optimizeJPEG: function (data, options) {
            let file = data.files[data.index];
            if (!/(\.|\/)(jpe?g)$/i.test(file.type)) {
              return data;
            }
            let p = new Promise((resolve, reject) => {
              console.log(`Transforming ${file.name}`);

              const content = `importScripts( "${fixScriptURL(
                settings.theme_uploads.image_optimizer_worker
              )}" );`;
              const worker_url = URL.createObjectURL(
                new Blob([content], { type: "text/javascript" })
              );
              const worker = new Worker(worker_url);

              worker.addEventListener("message", async function (e) {
                console.log("Main: Message received from worker script");
                console.log(e);
                switch (e.data.type) {
                  case "ready":
                    let drawable;
                    if ("createImageBitmap" in self) {
                      drawable = await createImageBitmap(file);
                    } else {
                      const url = URL.createObjectURL(file);
                      const img = new Image();
                      img.decoding = "async";
                      img.src = url;
                      const loaded = new Promise((resolve, reject) => {
                        img.onload = () => resolve();
                        img.onerror = () =>
                          reject(Error("Image loading error"));
                      });

                      if (img.decode) {
                        // Nice off-thread way supported in Safari/Chrome.
                        // Safari throws on decode if the source is SVG.
                        // https://bugs.webkit.org/show_bug.cgi?id=188347
                        await img.decode().catch(() => null);
                      }

                      // Always await loaded, as we may have bailed due to the Safari bug above.
                      await loaded;

                      drawable = img;
                    }

                    const width = drawable.width,
                      height = drawable.height,
                      sx = 0,
                      sy = 0,
                      sw = width,
                      sh = height;
                    // Make canvas same size as image
                    const canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    // Draw image onto canvas
                    const ctx = canvas.getContext("2d");
                    if (!ctx)
                      throw new Error("Could not create canvas context");
                    ctx.drawImage(
                      drawable,
                      sx,
                      sy,
                      sw,
                      sh,
                      0,
                      0,
                      width,
                      height
                    );
                    const imageData = ctx.getImageData(0, 0, width, height);
                    canvas.remove();

                    worker.postMessage(
                      {
                        type: "compress",
                        file: imageData.data.buffer,
                        file_name: file.name,
                        width: width,
                        height: height,
                        settings: {
                          wasm_mozjpeg_wasm: fixScriptURL(
                            settings.theme_uploads.wasm_mozjpeg_wasm
                          ),
                          wasm_image_loader_wasm: fixScriptURL(
                            settings.theme_uploads.wasm_image_loader_wasm
                          ),
                          resize_width_threshold:
                            settings.resize_width_threshold,
                          resize_height_threshold:
                            settings.resize_height_threshold,
                          enable_resize: settings.enable_resize,
                          enable_reencode: settings.enable_reencode,
                        },
                      },
                      [imageData.data.buffer]
                    );
                    break;
                  case "file":
                    let optimizedFile = new File(
                      [e.data.file],
                      `${file.name}`,
                      {
                        type: "image/jpeg",
                      }
                    );
                    console.log(
                      `Finished optimization of ${optimizedFile.name} new size: ${optimizedFile.size}.`
                    );
                    data.files[data.index] = optimizedFile;
                    worker.terminate();
                    resolve(data);
                    break;
                  case "error":
                    worker.terminate();
                    resolve(data);
                    break;
                  default:
                    console.log(`Sorry, we are out of ${e}.`);
                }
              });

              worker.postMessage({
                type: "install",
                list: [
                  fixScriptURL(settings.theme_uploads.wasm_mozjpeg_js),
                  fixScriptURL(settings.theme_uploads.wasm_image_loader_js),
                ],
              });
            });
            return p;
          },
        }
      );
    });
  },
};
