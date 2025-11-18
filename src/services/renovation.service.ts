
import { Injectable, signal, computed } from '@angular/core';
import { ShoppingItem, GeneratedShoppingItem, CategorizedShoppingItem, GeneratedProductSuggestion } from '../interfaces/shopping-item.interface';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';

@Injectable({ providedIn: 'root' })
export class RenovationService {
  private itemsSignal = signal<ShoppingItem[]>([]);
  isGenerating = signal<boolean>(false); // For material list
  aiError = signal<string | null>(null);
  detailedAnalysisResult = signal<string | null>(null); // New signal for combined analysis
  isGeneratingDetailedAnalysis = signal<boolean>(false); // New signal for combined analysis loading state

  shoppingListSuggestions = signal<GeneratedProductSuggestion[]>([]); // New signal for AI-generated shopping list
  isGeneratingShoppingList = signal<boolean>(false); // New signal for shopping list generation loading state

  // For operational brief
  operationalBriefResult = signal<string | null>(null);
  isGeneratingOperationalBrief = signal<boolean>(false);

  userBudget = signal<number>(0); // New signal for user-defined budget

  readonly allItems = this.itemsSignal.asReadonly(); // Exposes the flat, unsorted list

  readonly categorizedItems = computed<CategorizedShoppingItem[]>(() => {
    const items = this.itemsSignal();
    const categories: { [key: string]: ShoppingItem[] } = {};
    items.forEach(item => {
      const category = item.category?.trim() || 'Nekategorizirano';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(item);
    });

    for (const categoryName in categories) {
      categories[categoryName].sort((a, b) => a.name.localeCompare(b.name));
    }

    const sortedCategories = Object.keys(categories).sort((a, b) => a.localeCompare(b));

    return sortedCategories.map(categoryName => ({
      categoryName: categoryName,
      items: categories[categoryName]
    }));
  });

  readonly totalBudget = computed(() =>
    this.itemsSignal().reduce((sum, item) => sum + item.totalCost, 0)
  );

  readonly budgetDifference = computed(() =>
    this.userBudget() - this.totalBudget()
  );

  readonly categoryCosts = computed(() => {
    const items = this.itemsSignal();
    const costsMap = new Map<string, number>();

    items.forEach(item => {
      const category = item.category?.trim() || 'Nekategorizirano';
      costsMap.set(category, (costsMap.get(category) || 0) + item.totalCost);
    });

    return Array.from(costsMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => a.category.localeCompare(b.category));
  });

  private ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  async generateRenovationMaterials(userPrompt: string): Promise<void> {
    this.isGenerating.set(true);
    this.aiError.set(null);

    const expertContext = `
    Prilikom generiranja popisa materijala, uzmi u obzir opseg posla koji bi uključivao sljedeće stručnjake:
    - Arhitekt/Dizajner interijera: Za idejni projekt, raspored, estetiku.
    - Građevinski inženjer (Statičar): Za rušenje nosivih zidova ili konstrukcijske promjene.
    - Vodoinstalater: Za sve radove s vodovodom i odvodnjom.
    - Električar: Za električne instalacije, utičnice, rasvjetu.
    - Keramičar: Za postavljanje keramičkih pločica.
    - Parketar/Podopolagač: Za postavljanje podnih obloga.
    - Zidar/Ličilac/Knaufer: Za zidanje, gletanje, bojanje, suhomontažne radove.
    - Stolar/Izrađivač namještaja po mjeri: Za kuhinje, ormare, namještaj po mjeri.
    - Izvođač radova/Voditelj projekta: Za koordinaciju cijelog projekta "ključ u ruke".
    - Stolar (za prozore i vrata): Za zamjenu stolarije.
    `;

    const fullPrompt = `Generiraj detaljan popis materijala potrebnih za renoviranje stana, uzimajući u obzir sljedeći opis: "${userPrompt}". 
    Popis treba uključivati stavke za podove, zidne obloge, boju, rasvjetu i vodovodne instalacije. 
    Za svaki materijal uključi procjenu idealne količine na temelju tipičnih scenarija renovacije, s obzirom na navedenu veličinu i stil stana, te procijenjeni trošak po jedinici. 
    Također, za svaku stavku navedi odgovarajuću jedinicu mjere (npr. m2, litara, komada, kg).
    Ako su u opisu "${userPrompt}" spomenuti specifični brendovi ili razine kvalitete, molimo da ih uzmete u obzir i uključite u prijedloge materijala gdje je to primjenjivo.
    ${expertContext}
    Formatiraj odgovor kao JSON array objekata.`;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Naziv materijala.' },
                category: { type: Type.STRING, description: 'Kategorija materijala (npr. Podovi, Zidne obloge, Rasvjeta).' },
                quantity: { type: Type.NUMBER, description: 'Procijenjena količina.' },
                unit: { type: Type.STRING, description: 'Jedinica mjere (npr. m2, litara, komada).' },
                estimatedPricePerUnit: { type: Type.NUMBER, description: 'Procijenjena cijena po jedinici.' },
              },
              propertyOrdering: ['name', 'category', 'quantity', 'unit', 'estimatedPricePerUnit'],
            },
          },
        },
      });

      const jsonStr = response.text.trim();
      const generated: GeneratedShoppingItem[] = JSON.parse(jsonStr);

      const itemsToAdd: ShoppingItem[] = generated.map((genItem) => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        name: genItem.name,
        category: genItem.category || 'Nekategorizirano', // Ensure category is always set
        quantity: genItem.quantity,
        unit: genItem.unit || 'kom', // Default unit if AI doesn't provide it
        pricePerUnit: genItem.estimatedPricePerUnit,
        totalCost: genItem.quantity * genItem.estimatedPricePerUnit,
        purchased: false,
      }));

      this.itemsSignal.update((currentItems) => [...currentItems, ...itemsToAdd]);
    } catch (error: any) {
      console.error('Error generating renovation materials:', error);
      this.aiError.set('Greška pri generiranju popisa. Molimo pokušajte ponovno. Detalji: ' + (error.message || 'Nepoznata greška.'));
    } finally {
      this.isGenerating.set(false);
    }
  }

  async generateDetailedAnalysis(userPrompt: string): Promise<void> {
    this.isGeneratingDetailedAnalysis.set(true);
    this.aiError.set(null);
    this.detailedAnalysisResult.set(null); // Clear previous analysis

    const expertAndCostPrompt = `
    Kao dio analize, pruži detaljan opis potrebnih stručnjaka za renovaciju stana na temelju opisa: "${userPrompt}".
    Za svakog stručnjaka, opiši njegove ključne uloge i odgovornosti te **procijeni tržišne cijene (u EUR) za njihove usluge/radove u Hrvatskoj**, navodeći moguće raspone cijena ili metode naplate (npr. po m2, po satu, fiksna cijena za projekt).
    Uključi sljedeće stručnjake:
    - Arhitekt/Dizajner interijera
    - Građevinski inženjer (Statičar)
    - Vodoinstalater
    - Električar
    - Keramičar
    - Parketar/Podopolagač
    - Zidar/Ličilac/Knaufer
    - Stolar/Izrađivač namještaja po mjeri
    - Izvođač radova/Voditelj projekta
    - Stolar (za prozore i vrata)
    `;

    const fullAnalysisPrompt = `Pruži sveobuhvatnu i detaljnu analizu projekta renovacije stana na temelju sljedećeg opisa: "${userPrompt}". 
    Analiza treba uključivati sljedeće sekcije, strukturirane s jasnim naslovima i listama za bolju preglednost:

    ### 1. Objašnjenje traženog posla
    Jasno definiraj ciljeve i opseg renovacije.

    ### 2. Detaljna analiza projekta
    - Procjena trenutnog stanja i potencijalnih izazova.
    - Smjernice za definiranje budžeta (uključujući preporučenu rezervu za nepredviđene troškove).
    - Procjena realnog vremenskog okvira za svaku fazu.
    - Razmatranje funkcionalnosti i estetskih aspekata.

    ### 3. Potrebni dokumenti i dozvole
    Navedi sve relevantne dozvole i elaborate koji bi mogli biti potrebni (npr. građevinska dozvola, statički elaborat, energetski certifikat, suglasnosti susjeda/zgrade).

    ### 4. Potrebni projekti
    Opiši koje vrste projekata (npr. arhitektonski, projekt interijera, elektroinstalacija, strojarskih instalacija, vodovoda i odvodnje) mogu biti potrebni i zašto.

    ### 5. Potrebni radovi
    Detaljno opiši tipične faze radova:
    - Demontaža i rušenje.
    - Grubi radovi (zidanje, pregradni zidovi, instalacije).
    - Završni radovi (žbukanje, gletanje, bojanje, podovi, pločice, montaža sanitarija, rasvjete).
    - Montaža namještaja po mjeri.
    - Završno čišćenje.

    ### 6. Savjeti za nabavu materijala i sredstava
    - Preporuke za planiranje nabave i usporedbu cijena.
    - Važnost rezerve materijala (količinski i financijski).
    - Logistika dostave i skladištenja.

    ### 7. Potrebni stručnjaci i procijenjene tržišne cijene radova
    ${expertAndCostPrompt}
    `
    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullAnalysisPrompt,
        config: {
          // No responseMimeType or responseSchema for free-form text
        },
      });
      this.detailedAnalysisResult.set(response.text.trim());
    } catch (error: any) {
      console.error('Error generating detailed analysis:', error);
      this.aiError.set('Greška pri generiranju detaljne analize. Molimo pokušajte ponovno. Detalji: ' + (error.message || 'Nepoznata greška.'));
    } finally {
      this.isGeneratingDetailedAnalysis.set(false);
    }
  }

  async generateShoppingListSuggestions(shoppingItems: ShoppingItem[]): Promise<void> {
    this.isGeneratingShoppingList.set(true);
    this.aiError.set(null);
    this.shoppingListSuggestions.set([]); // Clear previous suggestions

    if (shoppingItems.length === 0) {
      this.aiError.set('Popis za kupnju je prazan. Dodajte stavke prije generiranja preporuka.');
      this.isGeneratingShoppingList.set(false);
      return;
    }

    const itemsForPrompt = shoppingItems.map(item => ({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      estimatedPricePerUnit: item.pricePerUnit,
    }));

    const shoppingListPrompt = `
    Na temelju sljedećeg popisa stavki za renovaciju, generiraj konkretne prijedloge proizvoda s procijenjenim cijenama (u EUR) i linkovima na web shopove u Hrvatskoj gdje se ti proizvodi mogu kupiti.
    Za svaku stavku s popisa, pokušaj pronaći prikladne proizvode.
    Organiziraj rezultate grupiranjem prvo po NAZIVU TRGOVINE, a zatim po KATEGORIJI unutar svake trgovine.
    Lista stavki za koje treba pronaći prijedloge:
    ${JSON.stringify(itemsForPrompt, null, 2)}

    Formatiraj odgovor kao JSON array objekata, gdje svaki objekt predstavlja prijedlog proizvoda.
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: shoppingListPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                productName: { type: Type.STRING, description: 'Konkretan naziv predloženog proizvoda.' },
                suggestedPrice: { type: Type.NUMBER, description: 'Procijenjena cijena proizvoda u EUR.' },
                webShopLink: { type: Type.STRING, description: 'Direktni link na web shop gdje se proizvod može kupiti.' },
                category: { type: Type.STRING, description: 'Kategorija proizvoda (npr. Podovi, Boja, Sanitarije).' },
                storeName: { type: Type.STRING, description: 'Naziv web shopa ili trgovine.' },
                originalShoppingItemName: { type: Type.STRING, description: 'Naziv izvorne stavke s korisničkog popisa za koju je ovaj proizvod predložen.' },
              },
              propertyOrdering: ['productName', 'suggestedPrice', 'webShopLink', 'category', 'storeName', 'originalShoppingItemName'],
            },
          },
        },
      });

      const jsonStr = response.text.trim();
      const generated: GeneratedProductSuggestion[] = JSON.parse(jsonStr);
      this.shoppingListSuggestions.set(generated);

    } catch (error: any) {
      console.error('Error generating shopping list suggestions:', error);
      this.aiError.set('Greška pri generiranju shopping liste. Molimo provjerite da imate stavke na popisu i pokušajte ponovno. Detalji: ' + (error.message || 'Nepoznata greška.'));
    } finally {
      this.isGeneratingShoppingList.set(false);
    }
  }

  async generateOperationalBrief(detailedAnalysis: string | null, shoppingItems: ShoppingItem[], productSuggestions: GeneratedProductSuggestion[]): Promise<void> {
    this.isGeneratingOperationalBrief.set(true);
    this.aiError.set(null);
    this.operationalBriefResult.set(null);

    if (!detailedAnalysis && shoppingItems.length === 0 && productSuggestions.length === 0) {
      this.aiError.set('Nema dovoljno podataka za generiranje sažetka. Generirajte barem jednu analizu ili popis.');
      this.isGeneratingOperationalBrief.set(false);
      return;
    }

    const operationalBriefPrompt = `
    Ponašaj se kao iskusni voditelj projekata za renovaciju stanova. Dobio si sljedeće podatke generirane od strane AI asistenta:
    
    1. Detaljna Analiza Projekta:
    ${detailedAnalysis || 'Nije generirana.'}
    
    2. Generirani Popis Materijala za Kupnju (sažetak):
    ${shoppingItems.length > 0 ? shoppingItems.map(i => `- ${i.name} (${i.quantity} ${i.unit})`).join('\n') : 'Nije generiran.'}

    3. Prijedlozi Proizvoda iz Trgovina:
    ${productSuggestions.length > 0 ? productSuggestions.map(p => `- ${p.productName} iz ${p.storeName}`).join('\n') : 'Nisu generirani.'}

    Tvoj zadatak je napraviti KRITIČKU ANALIZU i isporučiti **skraćeni OPERATIVNI SAŽETAK** za vlasnika stana.
    Sažetak treba biti koncizan, jasan i fokusiran na akciju.
    Uključi sljedeće točke:
    - **Ključni zaključci:** Najvažniji uvidi iz svih analiza.
    - **Prioriteti i Sljedeći Koraci:** Što vlasnik stana treba napraviti prvo? (npr. kontaktirati arhitekta, provjeriti statiku, prikupiti ponude).
    - **Potencijalni Rizici i Upozorenja:** Na što treba obratiti posebnu pažnju? (npr. probijanje budžeta, kašnjenja, skriveni nedostaci u starim stanovima).
    - **Preporuke:** Tvoji stručni savjeti za uspješnu realizaciju projekta.

    Budi direktan, profesionalan i pruži konkretne, praktične savjete.
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: operationalBriefPrompt,
      });
      this.operationalBriefResult.set(response.text.trim());
    } catch (error: any) {
      console.error('Error generating operational brief:', error);
      this.aiError.set('Greška pri generiranju operativnog sažetka. Molimo pokušajte ponovno. Detalji: ' + (error.message || 'Nepoznata greška.'));
    } finally {
      this.isGeneratingOperationalBrief.set(false);
    }
  }

  addItem(item: Omit<ShoppingItem, 'id' | 'totalCost'>): void {
    const newItem: ShoppingItem = {
      ...item,
      id: Date.now().toString(), // Simple unique ID
      category: item.category || 'Nekategorizirano', // Ensure category is always set
      unit: item.unit || 'kom', // Ensure unit is always set
      totalCost: item.quantity * item.pricePerUnit,
    };
    this.itemsSignal.update((items) => [...items, newItem]);
  }

  updateItem(id: string, updates: Partial<ShoppingItem>): void {
    this.itemsSignal.update((items) =>
      items.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, ...updates };
          if (updates.quantity !== undefined || updates.pricePerUnit !== undefined) {
            updatedItem.totalCost = updatedItem.quantity * updatedItem.pricePerUnit;
          }
          if (updates.category !== undefined) {
            updatedItem.category = updates.category || 'Nekategorizirano'; // Ensure category is always set
          }
          if (updates.unit !== undefined) {
            updatedItem.unit = updates.unit || 'kom'; // Ensure unit is always set
          }
          return updatedItem;
        }
        return item;
      })
    );
  }

  removeItem(id: string): void {
    this.itemsSignal.update((items) => items.filter((item) => item.id !== id));
  }

  clearAllItems(): void {
    this.itemsSignal.set([]);
  }
}