import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Recipe, RecipeSchema, RecipeEditResult, RecipeEditResultSchema } from "./schema.js";

const client = new Anthropic();
const MODEL = "claude-opus-5";

const RECIPE_FORMAT_SYSTEM = `You are a professional recipe editor for a home cooking app. You turn messy source
material (documents, web pages, social media captions, or photos of handwritten/printed recipe
cards) into a clean, well-structured recipe in the app's standard format.

Rules:
- Preserve the actual recipe faithfully - do not invent ingredients or steps that are not implied
  by the source. If a quantity or time is genuinely not stated, use null rather than guessing.
- Normalize ingredient quantities and units into separate fields (quantity as a number, unit as a
  short string like "g", "tbsp", "cup", "tsp", "ml", "kg", "oz", "lb", or null for counted items
  like "2 eggs").
- Break the method into clear, ordered, self-contained steps - each step should make sense on its
  own when shown one-at-a-time in a step-by-step cooking mode.
- If the source is noisy (ads, comments, navigation text, hashtags, emoji), ignore everything that
  isn't part of the recipe itself.
- Write a short, appealing description if the source doesn't already provide one.`;

async function extractRecipe(content: BetaContentBlockParam[]): Promise<Recipe> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: RECIPE_FORMAT_SYSTEM,
    output_format: betaZodOutputFormat(RecipeSchema),
    messages: [{ role: "user", content }],
  });

  if (!response.parsed_output) {
    throw new Error("Claude could not extract a structured recipe from this source.");
  }
  return response.parsed_output;
}

export async function importRecipeFromText(text: string): Promise<Recipe> {
  return extractRecipe([
    {
      type: "text",
      text: `Turn the following recipe source text into the app's structured recipe format:\n\n${text}`,
    },
  ]);
}

export async function importRecipeFromUrl(url: string, pageText: string): Promise<Recipe> {
  return extractRecipe([
    {
      type: "text",
      text: `The following text was fetched from this URL: ${url}\n\nIt may be a recipe blog post, a\nnews article, or a social media post caption. Extract the recipe from it and put it into the\napp's structured recipe format. If the fetched text is too sparse or gated (e.g. a login wall)\nto contain a real recipe, do your best with whatever recipe content is present and leave fields\nnull where genuinely unknown.\n\n--- FETCHED PAGE TEXT ---\n${pageText}`,
    },
  ]);
}

export interface ImageInput {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export async function importRecipeFromImages(images: ImageInput[], extraContext?: string): Promise<Recipe> {
  const content: BetaContentBlockParam[] = images.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
  }));
  content.push({
    type: "text",
    text:
      `These ${images.length > 1 ? "images are pages of a single handwritten or printed recipe" : "image is a photo of a handwritten or printed recipe"} from a personal recipe book. Read the handwriting/print carefully and transcribe the recipe into the app's structured format, preserving the original ingredients, quantities and method as faithfully as possible.` +
      (extraContext ? `\n\nAdditional context from the user: ${extraContext}` : ""),
  });
  return extractRecipe(content);
}

const EDIT_SYSTEM = `You are a professional recipe editor for a home cooking app. The user has an existing
structured recipe and wants you to apply a specific change they've requested in plain language.
Requests fall into a few common categories, though the user's wording may vary:

- Taste/flavor adjustments (e.g. "make it less sweet", "add more garlic", "make it spicier") -
  adjust ingredient quantities (e.g. reduce sugar) and, if needed, method steps. Keep the dish
  recognizably the same recipe.
- Scaling to available ingredients (e.g. "I only have 4 bananas", "I've got 500g of mince") -
  figure out which ingredient they mean, compute the implied scale factor against the recipe's
  current quantity for that ingredient (using your culinary knowledge for unit conversions, e.g.
  a medium banana is roughly 120g or about 1/2 cup mashed), then scale EVERY ingredient quantity
  and the servings count by that same factor, rounding to sensible cooking precision (e.g. nearest
  0.25 for cups, nearest 5g, whole eggs where possible). Also update any quantities mentioned
  inline in the method steps so they stay consistent, and adjust cook/prep times or pan sizes in
  the notes if that matters at the new scale.
- Unit conversions (e.g. "use grams for butter instead of tablespoons", "convert everything to
  metric") - convert the specified ingredient(s) (or all ingredients) to the requested unit system,
  using standard ingredient density conversions, and update any inline mentions in the method steps.
- General edits (swap an ingredient, change a technique, adjust cook time, etc.) - apply them
  directly and adjust anything else in the recipe that the change affects for consistency.

Always return the FULL updated recipe (not just a diff) in the app's structured format, plus a
short changeSummary (1-2 sentences, plain language) explaining exactly what you changed. If the
request is ambiguous or can't be matched to anything in the recipe, make the most reasonable
interpretation and say so briefly in changeSummary.`;

export async function editRecipe(recipe: Recipe, instruction: string): Promise<RecipeEditResult> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: EDIT_SYSTEM,
    output_format: betaZodOutputFormat(RecipeEditResultSchema),
    messages: [
      {
        role: "user",
        content: `Current recipe (JSON):\n${JSON.stringify(recipe, null, 2)}\n\nRequested change:\n"${instruction}"`,
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("Claude could not apply that change to the recipe.");
  }
  return response.parsed_output;
}

export async function extractPageText(html: string): Promise<string> {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const metaMatches = [...withoutScripts.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:description|og:title|description)["'][^>]+content=["']([^"']*)["'][^>]*>/gi)].map(
    (m) => m[1],
  );

  const text = withoutScripts
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const combined = [...metaMatches, text].join("\n");
  return combined.slice(0, 20000);
}
