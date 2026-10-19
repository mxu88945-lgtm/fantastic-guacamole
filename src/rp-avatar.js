// Keep scene portraits small enough for local storage and cloud snapshots.
export async function readRoleplayAvatar(file) {
  if (!file || !file.type?.startsWith("image/")) throw new Error("请选择一张图片");
  if (file.size > 20 * 1024 * 1024) throw new Error("图片过大，请选择 20MB 以内的图片");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("这张图片无法读取，换一张 JPG 或 PNG 试试"));
      img.src = source;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("图片没有可用的尺寸");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(256, side);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片处理失败，请重新选择");
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally { URL.revokeObjectURL(source); }
}
