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
                    let arrayBuffer = await file.arrayBuffer();
                    worker.postMessage(
                      {
                        type: "compress",
                        file: arrayBuffer,
                        file_name: file.name,
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
                      [arrayBuffer]
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
