# Shop jewellery carousel

Dashboard → **Shop carousel** edits each card's photo, title, description, destination, display order and visibility. Save each edited card, then refresh the shop page. No new SQL migration is needed. Existing banners storage/RLS and the product-images upload bucket are reused; tagged rows are excluded from the homepage editor.

Desktop shows three cards, tablet two and mobile one. Autoplay advances every 4.5 seconds, with previous/next, pause/play and touch swipe. Focus/desktop hover pauses movement. These are illustrative campaign photos, not exact inventory images.

## Assets and generation

Built-in image_gen mode, ten separate generations, no retries. Final web assets are in `images/shop-carousel/` (JPEG encoding, quality 85); PNG originals are retained locally in `output/imagegen/shop-carousel/`. All paths below are relative to this document's workspace directory.

| Final asset | Prompt subject |
| --- | --- |
| images/shop-carousel/gold-necklace.jpg | Ornate gold necklace on burgundy velvet |
| images/shop-carousel/diamond-ring.jpg | Diamond solitaire ring on charcoal stone |
| images/shop-carousel/jhumka-earrings.jpg | Traditional gold jhumka earrings on ivory silk |
| images/shop-carousel/gold-bangles.jpg | Gold bangles on a terracotta plinth |
| images/shop-carousel/emerald-pendant.jpg | Emerald green gemstone pendant on dark green silk |
| images/shop-carousel/daily-chain.jpg | Delicate daily-wear gold chain on soft warm paper |
| images/shop-carousel/bridal-set.jpg | Bridal gold jewellery set on wine-red textile |
| images/shop-carousel/silver-anklets.jpg | Silver anklets on pale blue-gray stone |
| images/shop-carousel/gift-pendant.jpg | Gold pendant in an open burgundy gift box |
| images/shop-carousel/diamond-studs.jpg | Minimal small diamond studs on champagne-colored stone |

Exact shared prompt, substituting the corresponding subject:

```text
Use case: product-mockup
Asset type: square jewellery campaign photograph for Tripti Jewellers shop carousel
Primary request: {subject}.
Style/medium: premium photorealistic editorial studio product photography, coherent luxury jewellery campaign, elegant and restrained.
Composition/framing: square image; jewellery fully visible, centered with generous margin, crisp product detail and clean arrangement.
Lighting/mood: soft natural window-style lighting, controlled realistic highlights, gentle shadows.
Materials/textures: true-to-life precious metal and gemstone detail, visible natural texture of the specified backdrop.
Constraints: illustrative campaign jewellery, not an exact inventory product. No text, logos, watermarks, people, hands, collage, panels or unrelated props. Create exactly one new photograph.
```
