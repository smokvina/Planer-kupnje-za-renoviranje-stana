export interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string; // Added unit property
  pricePerUnit: number;
  totalCost: number;
  purchased: boolean;
}

export interface GeneratedShoppingItem {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  estimatedPricePerUnit: number;
}

// Added missing interface
export interface CategorizedShoppingItem {
  categoryName: string;
  items: ShoppingItem[];
}

// New interface for AI-generated product suggestions
export interface GeneratedProductSuggestion {
  productName: string;
  suggestedPrice: number; // Price in EUR
  webShopLink: string; // URL to the product
  category: string; // The category of the product
  storeName: string; // Name of the web shop/store
  originalShoppingItemName: string; // Name of the item from the user's list that this product fulfills
}