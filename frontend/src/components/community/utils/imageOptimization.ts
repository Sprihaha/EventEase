export interface ImageOptimizationResult {
  dataUrl: string
  isOptimized: boolean
}

export function processAndCompressImage(
  file: File,
  maxDimension = 1400,
  quality = 0.82,
): Promise<ImageOptimizationResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return reject(
        new Error("Please select an image file (PNG, JPG, WebP, etc.)"),
      )
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const rawResult = e.target?.result as string
      if (!rawResult) {
        return reject(new Error("Could not read image file"))
      }

      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }

          const canvas = document.createElement("canvas")
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")

          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            const compressed = canvas.toDataURL("image/jpeg", quality)
            return resolve({ dataUrl: compressed, isOptimized: true })
          }
        }

        resolve({ dataUrl: rawResult, isOptimized: false })
      }

      img.onerror = () => {
        resolve({ dataUrl: rawResult, isOptimized: false })
      }

      img.src = rawResult
    }

    reader.onerror = () => {
      reject(new Error("Could not read image file"))
    }

    reader.readAsDataURL(file)
  })
}
