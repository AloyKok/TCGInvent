import { create } from 'zustand';
import type { CartLine, InventoryItem, PaymentMethod } from '../types/domain';
import type { SaleMode } from '../lib/reports/revenuePeriods';

interface CartState {
  lines: CartLine[];
  saleMode: SaleMode | '';
  eventId: string;
  finalTotal: number | null;
  paymentMethod: PaymentMethod;
  notes: string;
  addItem: (item: InventoryItem, quantity?: number) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  removeItem: (itemId: string) => void;
  setSaleMode: (saleMode: SaleMode | '') => void;
  setEventId: (eventId: string) => void;
  setFinalTotal: (total: number | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setNotes: (notes: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  saleMode: '',
  eventId: '',
  finalTotal: null,
  paymentMethod: 'cash',
  notes: '',
  addItem: (item, quantity = 1) =>
    set((state) => {
      const existing = state.lines.find((line) => line.item.id === item.id);
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.item.id === item.id
              ? { ...line, quantity: Math.min(item.quantity, line.quantity + quantity) }
              : line
          ),
          finalTotal: null
        };
      }
      return {
        lines: [{ item, quantity: Math.min(item.quantity, quantity) }, ...state.lines],
        finalTotal: null
      };
    }),
  setQuantity: (itemId, quantity) =>
    set((state) => ({
      lines: state.lines
        .map((line) =>
          line.item.id === itemId ? { ...line, quantity: Math.max(1, Math.min(line.item.quantity, quantity)) } : line
        )
        .filter((line) => line.quantity > 0),
      finalTotal: null
    })),
  removeItem: (itemId) => set((state) => ({
    lines: state.lines.filter((line) => line.item.id !== itemId),
    finalTotal: null
  })),
  setSaleMode: (saleMode) => set({ saleMode }),
  setEventId: (eventId) => set({ eventId }),
  setFinalTotal: (finalTotal) => set({ finalTotal: finalTotal === null ? null : Math.max(0, finalTotal) }),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setNotes: (notes) => set({ notes }),
  clear: () => set({ lines: [], finalTotal: null, paymentMethod: 'cash', notes: '' })
}));

export function getCartSubtotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.item.askingPrice * line.quantity, 0);
}
