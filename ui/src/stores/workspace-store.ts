'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WorkspaceBrand = { id: number; name: string; code: string; isDefault: boolean };

type WorkspaceState = {
  brands: WorkspaceBrand[];
  currentBrandId: number | null;
  setBrands: (brands: WorkspaceBrand[]) => void;
  setCurrentBrandId: (brandId: number | null) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(persist((set, get) => ({
  brands: [],
  currentBrandId: null,
  setBrands: (brands) => {
    const storedId = get().currentBrandId;
    const currentBrandId = brands.some((brand) => brand.id === storedId)
      ? storedId
      : brands.find((brand) => brand.isDefault)?.id ?? brands[0]?.id ?? null;
    set({ brands, currentBrandId });
  },
  setCurrentBrandId: (currentBrandId) => set({ currentBrandId }),
}), { name: 'geocite.workspace', partialize: (state) => ({ currentBrandId: state.currentBrandId }) }));
