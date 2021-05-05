import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "image-optimizer",

  initialize(container) {
    withPluginApi("0.8.24", (api) => {
      api.addComposerUploadHandler(["jpg", "jpeg"], function (file, reference) {
        if (file.name.startsWith("optimized_")) {
          return true;
        }
        console.log("Handling upload for", file.name);

        const worker = new Worker(
          settings.theme_uploads.image_optimizer_worker
        );

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
                    base_url: Discourse.BaseUrl,
                    wasm_mozjpeg_wasm: settings.theme_uploads.wasm_mozjpeg_wasm,
                    wasm_image_loader_wasm:
                      settings.theme_uploads.wasm_image_loader_wasm,
                  },
                },
                [arrayBuffer]
              );
              break;
            case "file":
              let optimizedFile = new File(
                [e.data.file],
                `optimized_${file.name}`,
                {
                  type: "image/jpeg",
                }
              );
              console.log(optimizedFile);
              $(".wmd-controls").fileupload("add", {
                files: [optimizedFile],
              });
              break;
            default:
              console.log(`Sorry, we are out of ${e}.`);
          }
        });

        worker.postMessage({
          type: "install",
          list: [
            settings.theme_uploads.wasm_mozjpeg_js,
            settings.theme_uploads.wasm_image_loader_js,
          ],
        });
        return false;
      });
    });
  },
};
