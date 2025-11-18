import { Component, ChangeDetectionStrategy, inject, signal, ViewChild, ElementRef, AfterViewInit, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RenovationService } from '../../services/renovation.service';
import { FormsModule } from '@angular/forms';
import { ShoppingItem, GeneratedProductSuggestion } from '../../interfaces/shopping-item.interface'; // Import GeneratedProductSuggestion
import * as d3 from 'd3'; // Import D3.js

@Component({
  selector: 'app-renovation-planner',
  templateUrl: './renovation-planner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class RenovationPlannerComponent implements AfterViewInit {
  renovationService = inject(RenovationService);

  newItemName = signal('');
  newItemCategory = signal('');
  newItemQuantity = signal(1);
  newItemUnit = signal(''); // New signal for new item unit
  newItemPricePerUnit = signal(0);

  aiPrompt = signal('');
  detailedAnalysisPrompt = signal(''); // New signal for combined analysis prompt

  @ViewChild('chartRef') chartContainer!: ElementRef<SVGSVGElement>;

  constructor() {
    // Effect to redraw the chart whenever categoryCosts changes
    effect(() => {
      const data = this.renovationService.categoryCosts();
      if (this.chartContainer && data.length > 0) {
        this.drawChart(data);
      } else if (this.chartContainer) {
        // Clear chart if no data
        d3.select(this.chartContainer.nativeElement).selectAll('*').remove();
      }
    });
  }

  ngAfterViewInit(): void {
    // Initial draw if data exists after view init
    const data = this.renovationService.categoryCosts();
    if (data.length > 0) {
      this.drawChart(data);
    }
  }

  private drawChart(data: { category: string, total: number }[]): void {
    const element = this.chartContainer.nativeElement;
    // Clear previous chart
    d3.select(element).selectAll('*').remove();

    const containerWidth = element.clientWidth || 300; // Default width
    const containerHeight = element.clientHeight || 250; // Default height

    const margin = { top: 20, right: 30, bottom: 80, left: 60 }; // Increased bottom margin for labels
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const svg = d3.select(element)
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X scale
    const x = d3.scaleBand()
      .range([0, width])
      .domain(data.map(d => d.category))
      .padding(0.2);

    // Y scale
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.total)! + 100]) // Add some padding to the max value
      .range([height, 0]);

    // X axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end')
      .style('font-size', '10px');

    // Y axis
    svg.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `${d}€`));

    // Bars
    svg.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.category)!)
      .attr('y', d => y(d.total))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.total))
      .attr('fill', '#4F46E5'); // Indigo-600

    // Bar labels
    svg.selectAll('.bar-label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'bar-label')
      .attr('x', d => x(d.category)! + x.bandwidth() / 2)
      .attr('y', d => y(d.total) - 5) // Position above the bar
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .text(d => d.total.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }));
  }


  async onGenerateList(): Promise<void> {
    const prompt = this.aiPrompt().trim();
    if (!prompt) {
      this.renovationService.aiError.set('Molimo unesite opis stana za generiranje popisa.');
      return;
    }
    await this.renovationService.generateRenovationMaterials(prompt);
    this.aiPrompt.set('');
  }

  async onGenerateDetailedAnalysis(): Promise<void> {
    const prompt = this.detailedAnalysisPrompt().trim();
    if (!prompt) {
      this.renovationService.aiError.set('Molimo unesite opis projekta za generiranje detaljne analize.');
      return;
    }
    await this.renovationService.generateDetailedAnalysis(prompt);
    this.detailedAnalysisPrompt.set('');
  }

  async onGenerateShoppingList(): Promise<void> {
    const items = this.renovationService.allItems();
    if (items.length === 0) {
      this.renovationService.aiError.set('Vaš popis za kupnju je prazan. Dodajte stavke prije generiranja preporuka za shopping listu.');
      return;
    }
    await this.renovationService.generateShoppingListSuggestions(items);
  }

  // Computed signal for grouping shopping list suggestions by store and category
  readonly groupedShoppingListSuggestions = computed(() => {
    const suggestions = this.renovationService.shoppingListSuggestions();
    if (suggestions.length === 0) return [];

    const storeMap = new Map<string, Map<string, GeneratedProductSuggestion[]>>();

    suggestions.forEach(sug => {
      const storeName = sug.storeName?.trim() || 'Ostale trgovine';
      const categoryName = sug.category?.trim() || 'Nekategorizirano';

      if (!storeMap.has(storeName)) {
        storeMap.set(storeName, new Map<string, GeneratedProductSuggestion[]>());
      }
      const categoryMap = storeMap.get(storeName)!;

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, []);
      }
      categoryMap.get(categoryName)!.push(sug);
    });

    const grouped = Array.from(storeMap.entries()).map(([storeName, categoryMap]) => ({
      storeName,
      categories: Array.from(categoryMap.entries()).map(([categoryName, products]) => ({
        categoryName,
        products: products.sort((a, b) => a.productName.localeCompare(b.productName)) // Sort products alphabetically
      })).sort((a, b) => a.categoryName.localeCompare(b.categoryName)) // Sort categories alphabetically
    }));

    return grouped.sort((a, b) => a.storeName.localeCompare(b.storeName)); // Sort stores alphabetically
  });


  addItem(): void {
    const name = this.newItemName().trim();
    const category = this.newItemCategory().trim();
    const quantity = this.newItemQuantity();
    const unit = this.newItemUnit().trim(); // Get unit from input
    const pricePerUnit = this.newItemPricePerUnit();

    if (!name || quantity <= 0 || pricePerUnit < 0) {
      alert('Molimo unesite valjan naziv stavke, količinu veću od 0 i nenegativnu cijenu.');
      return;
    }

    this.renovationService.addItem({
      name,
      category: category || 'Nekategorizirano',
      quantity,
      unit: unit || 'kom', // Use input unit or default to 'kom'
      pricePerUnit,
      purchased: false,
    });

    this.newItemName.set('');
    this.newItemCategory.set('');
    this.newItemQuantity.set(1);
    this.newItemUnit.set(''); // Clear unit input
    this.newItemPricePerUnit.set(0);
  }

  removeItem(id: string): void {
    this.renovationService.removeItem(id);
  }

  togglePurchased(item: ShoppingItem): void {
    this.renovationService.updateItem(item.id, { purchased: !item.purchased });
  }

  updateName(item: ShoppingItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    if (name) {
      this.renovationService.updateItem(item.id, { name });
    }
  }

  updateCategory(item: ShoppingItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const category = input.value.trim();
    this.renovationService.updateItem(item.id, { category: category || 'Nekategorizirano' });
  }

  updateQuantity(item: ShoppingItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const quantity = Number(input.value);
    if (!isNaN(quantity) && quantity > 0) {
      this.renovationService.updateItem(item.id, { quantity });
    }
  }

  updateUnit(item: ShoppingItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const unit = input.value.trim();
    this.renovationService.updateItem(item.id, { unit: unit || 'kom' });
  }

  increaseQuantity(item: ShoppingItem): void {
    this.renovationService.updateItem(item.id, { quantity: item.quantity + 1 });
  }

  decreaseQuantity(item: ShoppingItem): void {
    if (item.quantity > 1) {
      this.renovationService.updateItem(item.id, { quantity: item.quantity - 1 });
    }
  }

  updatePricePerUnit(item: ShoppingItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const pricePerUnit = Number(input.value);
    if (!isNaN(pricePerUnit) && pricePerUnit >= 0) {
      this.renovationService.updateItem(item.id, { pricePerUnit });
    }
  }

  updateUserBudget(event: Event): void {
    const input = event.target as HTMLInputElement;
    const budget = Number(input.value);
    if (!isNaN(budget) && budget >= 0) {
      this.renovationService.userBudget.set(budget);
    } else if (input.value === '') { // Allow clearing the input
      this.renovationService.userBudget.set(0);
    }
  }

  clearAll(): void {
    if (confirm('Jeste li sigurni da želite obrisati sve stavke?')) {
      this.renovationService.clearAllItems();
    }
  }

  async copyDetailedAnalysis(): Promise<void> {
    const analysisText = this.renovationService.detailedAnalysisResult();
    if (analysisText) {
      try {
        await navigator.clipboard.writeText(analysisText);
        alert('Analiza kopirana u međuspremnik!');
      } catch (err) {
        console.error('Greška pri kopiranju analize: ', err);
        alert('Kopiranje nije uspjelo. Pokušajte ručno.');
      }
    }
  }

  downloadDetailedAnalysisTxt(): void {
    const analysisText = this.renovationService.detailedAnalysisResult();
    if (analysisText) {
      const blob = new Blob([analysisText], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'detaljna_ai_analiza_projekta_renovacije.txt';
      link.click();
      URL.revokeObjectURL(link.href);
    }
  }

  // Helper to generate the text content for the shopping list export/copy
  private generateShoppingListTextContent(): string {
    const allItemsFlat = this.renovationService.allItems();
    const categorizedForExport = this.renovationService.categorizedItems();

    const purchasedItems = allItemsFlat.filter(item => item.purchased);
    const unpurchasedItems = allItemsFlat.filter(item => !item.purchased);

    let fileContent = 'Popis za kupnju za renovaciju:\n\n';

    if (allItemsFlat.length === 0) {
      fileContent += 'Popis je prazan.';
    } else {
      fileContent += '--- Kategorizirani popis stavki ---\n';
      categorizedForExport.forEach(categoryGroup => {
        fileContent += `\n### ${categoryGroup.categoryName} ###\n`;
        categoryGroup.items.forEach((item, index) => {
          fileContent += `${index + 1}. Naziv: ${item.name} ${item.purchased ? '(Kupljeno)' : ''}\n`;
          fileContent += `   Količina: ${item.quantity} ${item.unit}\n`; // Include unit
          fileContent += `   Cijena po jedinici: ${item.pricePerUnit.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}\n`;
          fileContent += `   Ukupna cijena: ${item.totalCost.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}\n`;
          fileContent += '-------------------------\n';
        });
      });
      fileContent += '\n-----------------------------------\n';


      // Summary of purchased vs unpurchased items
      if (unpurchasedItems.length > 0) {
        const totalUnpurchasedCost = unpurchasedItems.reduce((sum, item) => sum + item.totalCost, 0);
        fileContent += `\nUkupno za kupnju: ${totalUnpurchasedCost.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}\n`;
      }

      if (purchasedItems.length > 0) {
        const totalPurchasedCost = purchasedItems.reduce((sum, item) => sum + item.totalCost, 0);
        fileContent += `Ukupno kupljeno: ${totalPurchasedCost.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}\n`;
      }

      fileContent += `\nUkupni procijenjeni budžet (sve stavke): ${this.renovationService.totalBudget().toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}`;

      // Add user budget and difference
      const userBudget = this.renovationService.userBudget();
      const budgetDifference = this.renovationService.budgetDifference();

      fileContent += `\nMoj budžet: ${userBudget.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}`;
      fileContent += `\nRazlika (Budžet - Ukupni troškovi): ${budgetDifference.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}`;

    }
    return fileContent;
  }

  exportListToTxt(): void {
    const fileContent = this.generateShoppingListTextContent();
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'popis_za_kupnju_renovacija.txt';
    link.click();
    URL.revokeObjectURL(link.href); // Clean up the URL object
  }

  async copyShoppingList(): Promise<void> {
    const listContent = this.generateShoppingListTextContent();
    if (listContent) {
      try {
        await navigator.clipboard.writeText(listContent);
        alert('Popis za kupnju kopiran u međuspremnik!');
      } catch (err) {
        console.error('Greška pri kopiranju popisa: ', err);
        alert('Kopiranje popisa nije uspjelo. Pokušajte ručno.');
      }
    }
  }

  // --- RESTORED/ADDED METHODS ---

  async onGenerateOperationalBrief(): Promise<void> {
    const detailedAnalysis = this.renovationService.detailedAnalysisResult();
    const shoppingItems = this.renovationService.allItems();
    const productSuggestions = this.renovationService.shoppingListSuggestions();

    if (!detailedAnalysis && shoppingItems.length === 0 && productSuggestions.length === 0) {
      this.renovationService.aiError.set('Generirajte barem jednu od prethodnih analiza (detaljnu analizu, popis materijala ili shopping listu) prije stvaranja operativnog sažetka.');
      return;
    }
    
    await this.renovationService.generateOperationalBrief(detailedAnalysis, shoppingItems, productSuggestions);
  }

  async copyOperationalBrief(): Promise<void> {
    const briefText = this.renovationService.operationalBriefResult();
    if (briefText) {
      try {
        await navigator.clipboard.writeText(briefText);
        alert('Operativni sažetak kopiran u međuspremnik!');
      } catch (err) {
        console.error('Greška pri kopiranju sažetka: ', err);
        alert('Kopiranje nije uspjelo.');
      }
    }
  }

  downloadOperationalBriefTxt(): void {
    const briefText = this.renovationService.operationalBriefResult();
    if (briefText) {
      const blob = new Blob([briefText], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'operativni_sazetak_renovacije.txt';
      link.click();
      URL.revokeObjectURL(link.href);
    }
  }

  private generateShoppingListSuggestionsTextContent(): string {
    const groupedSuggestions = this.groupedShoppingListSuggestions();
    if (groupedSuggestions.length === 0) return 'Nema generiranih prijedloga za shopping listu.';

    let content = 'AI-generirana Shopping Lista:\n\n';

    groupedSuggestions.forEach(storeGroup => {
      content += `--- Trgovina: ${storeGroup.storeName} ---\n\n`;
      storeGroup.categories.forEach(categoryGroup => {
        content += `  ### Kategorija: ${categoryGroup.categoryName} ###\n`;
        categoryGroup.products.forEach(product => {
          content += `  - Proizvod: ${product.productName}\n`;
          content += `    Cijena: ${product.suggestedPrice.toLocaleString('hr-HR', { style: 'currency', currency: 'EUR' })}\n`;
          content += `    Izvorna stavka: ${product.originalShoppingItemName}\n`;
          content += `    Link: ${product.webShopLink}\n\n`;
        });
      });
    });
    return content;
  }

  async copyShoppingListSuggestions(): Promise<void> {
    const textContent = this.generateShoppingListSuggestionsTextContent();
    try {
      await navigator.clipboard.writeText(textContent);
      alert('Shopping lista kopirana u međuspremnik!');
    } catch (err) {
      console.error('Greška pri kopiranju shopping liste: ', err);
      alert('Kopiranje nije uspjelo.');
    }
  }

  downloadShoppingListSuggestionsTxt(): void {
    const textContent = this.generateShoppingListSuggestionsTextContent();
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ai_shopping_lista.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  }
}