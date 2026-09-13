import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import {
  importRecipeFromText,
  importRecipeFromUrl,
  importRecipeFromImages,
  extractPageText,
  editRecipe,
  type ImageInput,
} from "../anthropic.js";
import { insertRecipe, listRecipes, getRecipe, updateRecipeCurrent, deleteRecipe } from "../db.js";
import type { RecipeRecord } from "../schema.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const recipesRouter = Router();

recipesRouter.get("/", async (_req, res) => {
  try {
    res.json(await listRecipes());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

recipesRouter.get("/:id", async (req, res) => {
  try {
    const record = await getRecipe(req.params.id);
    if (!record) return res.status(404).json({ error: "Recipe not found" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

recipesRouter.delete("/:id", async (req, res) => {
  try {
    await deleteRecipe(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

async function saveNewRecipe(
  sourceType: RecipeRecord["sourceType"],
  sourceRef: string | null,
  recipe: RecipeRecord["current"],
) {
  const now = new Date().toISOString();
  const record: RecipeRecord = {
    id: nanoid(10),
    createdAt: now,
    updatedAt: now,
    sourceType,
    sourceRef,
    original: recipe,
    current: recipe,
    history: [],
  };
  await insertRecipe(record);
  return record;
}

recipesRouter.post("/import/text", async (req, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text || !text.trim()) return res.status(400).json({ error: "Missing 'text'" });
    const recipe = await importRecipeFromText(text);
    res.status(201).json(await saveNewRecipe("text", null, recipe));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

recipesRouter.post("/import/url", async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || !url.trim()) return res.status(400).json({ error: "Missing 'url'" });

    let pageHtml: string;
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      });
      pageHtml = await resp.text();
    } catch (fetchErr) {
      return res.status(422).json({
        error:
          "Could not fetch that URL directly (it may block automated requests). Try pasting the recipe text instead.",
      });
    }

    const pageText = await extractPageText(pageHtml);
    if (pageText.length < 40) {
      return res.status(422).json({
        error:
          "That page didn't return enough readable content (common for Instagram/TikTok/Facebook links). Try pasting the caption or recipe text instead.",
      });
    }

    const recipe = await importRecipeFromUrl(url, pageText);
    res.status(201).json(await saveNewRecipe("url", url, recipe));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

recipesRouter.post("/import/photo", upload.array("images", 6), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) return res.status(400).json({ error: "No images uploaded" });

    const images: ImageInput[] = files.map((f) => ({
      base64: f.buffer.toString("base64"),
      mediaType: f.mimetype as ImageInput["mediaType"],
    }));
    const extraContext = (req.body?.context as string | undefined) || undefined;

    const recipe = await importRecipeFromImages(images, extraContext);
    res.status(201).json(await saveNewRecipe("photo", `${files.length} photo(s)`, recipe));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

recipesRouter.post("/:id/edit", async (req, res) => {
  try {
    const record = await getRecipe(req.params.id);
    if (!record) return res.status(404).json({ error: "Recipe not found" });

    const { instruction } = req.body as { instruction?: string };
    if (!instruction || !instruction.trim()) return res.status(400).json({ error: "Missing 'instruction'" });

    const result = await editRecipe(record.current, instruction);
    const history = [
      ...record.history,
      { recipe: record.current, changeSummary: result.changeSummary, at: new Date().toISOString() },
    ];
    const updated = await updateRecipeCurrent(record.id, result.recipe, history);
    res.json({ record: updated, changeSummary: result.changeSummary });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

recipesRouter.post("/:id/revert", async (req, res) => {
  try {
    const record = await getRecipe(req.params.id);
    if (!record) return res.status(404).json({ error: "Recipe not found" });

    const { to } = req.body as { to?: "original" | "previous" };
    if (to === "previous" && record.history.length > 0) {
      const prevEntry = record.history[record.history.length - 1];
      const updated = await updateRecipeCurrent(record.id, prevEntry.recipe, record.history.slice(0, -1));
      return res.json(updated);
    }
    const updated = await updateRecipeCurrent(record.id, record.original, []);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
