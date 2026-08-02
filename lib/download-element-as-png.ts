import { toPng } from "html-to-image";

export async function downloadElementAsPng(element: HTMLElement, fileName: string) {
  await document.fonts?.ready;

  const dataUrl = await toPng(element, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 2,
    style: {
      left: "0",
      position: "static",
      top: "0",
      zIndex: "auto",
    },
  });

  const link = document.createElement("a");
  link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
  link.href = dataUrl;
  link.click();
}
