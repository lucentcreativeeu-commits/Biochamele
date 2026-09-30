Structure (Vercel):
  api/config.js        -> unchanged
  public/              -> site (index, shop/, product/, admin/, css/, js/, img/)
  vercel.json, package.json -> unchanged
Set Vercel "Output Directory" to public (or move public/* to root and keep api/).
Images in public/img are crops from the mockup: replace with real photos (same filenames).
