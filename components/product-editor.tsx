"use client";
// Add / edit a menu product (owners and managers). Prices are entered in GHS, stored in pesewas.
import { useState } from "react";
import { Trash2, X } from "lucide-react";
import FoodPhoto from "./food-photo";
import { Button, ConfirmDialog, useToast } from "./ui";
import type { Product } from "@/lib/domain";

export default function ProductEditor({
  product,
  categories,
  mutate,
  onClose,
}: {
  /** null when adding a new product. */
  product: Product | null;
  categories: string[];
  /** Posts an operations action and reloads; throws the server's message on failure. */
  mutate: (input: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = !product;
  const toast = useToast();
  const [image, setImage] = useState(product?.image ?? ""),
    [name, setName] = useState(product?.name ?? ""),
    [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  async function run(input: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await mutate(input);
      toast("success", done);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {
      action: isNew ? "createProduct" : "product",
      ...(product && { id: product.id }),
      name: f.get("name"),
      // Empty on edit keeps the current category.
      category: String(f.get("category") ?? "").trim() || undefined,
      description: String(f.get("description") ?? ""),
      price: Math.round(Number(f.get("price")) * 100),
      prep: Number(f.get("prep")),
      image: String(f.get("image") ?? "").trim(),
      ...(isNew && { availability: f.get("availability") }),
    };
    await run(input, isNew ? `${input.name} added to the menu.` : "Product saved.");
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet productSheet" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <header className="productSheet__head">
          <div>
            <span className="ui-eyebrow">{isNew ? "New product" : "Edit product"}</span>
            <h2 id="product-editor-title">{isNew ? "Add to the menu" : product.name}</h2>
          </div>
          <button type="button" className="iconButton" aria-label="Close product editor" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="productSheet__preview">
          <FoodPhoto src={/^https:\/\//i.test(image) ? image : ""} alt={name || "Product photo"} />
        </div>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <form className="productForm" onSubmit={submit}>
          <label className="span2">
            Name
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={product?.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jollof & Chicken"
            />
          </label>
          <label>
            Category
            <input
              name="category"
              list="product-categories"
              required={isNew}
              minLength={2}
              maxLength={60}
              defaultValue={product?.category}
              placeholder="e.g. Meals"
            />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            Price (GHS)
            <input
              name="price"
              type="number"
              step="0.01"
              min="1"
              max="1000"
              required
              defaultValue={product ? product.price / 100 : undefined}
              placeholder="0.00"
            />
          </label>
          <label className="span2">
            Description
            <textarea
              name="description"
              rows={2}
              maxLength={400}
              defaultValue={product?.description}
              placeholder="What's in it? Customers see this on the menu."
            />
          </label>
          <label>
            Preparation time (minutes)
            <input name="prep" type="number" min="1" max="120" required defaultValue={product?.prep ?? 15} />
          </label>
          {isNew ? (
            <label>
              Availability
              <select name="availability" defaultValue="AVAILABLE">
                <option value="AVAILABLE">Available</option>
                <option value="LOW_STOCK">Low stock</option>
                <option value="SOLD_OUT">Sold out</option>
              </select>
            </label>
          ) : (
            <span />
          )}
          <label className="span2">
            Photo link
            <input
              name="image"
              type="url"
              inputMode="url"
              placeholder="https://… (leave empty for a placeholder)"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
            <small className="quiet">Upload your photo to any image host and paste the https link here.</small>
          </label>

          <div className="productForm__actions span2">
            {!isNew && (
              <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
                <Trash2 size={16} aria-hidden /> Remove from menu
              </Button>
            )}
            <span className="spacer" />
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={busy}>
              {isNew ? "Add product" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>

      {product && (
        <ConfirmDialog
          open={confirming}
          title={`Remove ${product.name}?`}
          message="Customers will no longer see it and staff can't sell it. Past orders and reports keep it."
          actions={[
            { label: "Keep it", value: "cancel" },
            { label: "Remove", variant: "danger", value: "remove" },
          ]}
          onClose={async (v) => {
            setConfirming(false);
            if (v === "remove") await run({ action: "archiveProduct", id: product.id }, `${product.name} removed from the menu.`);
          }}
        />
      )}
    </div>
  );
}
