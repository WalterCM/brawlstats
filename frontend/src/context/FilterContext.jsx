import { createContext, useContext, useState } from 'react';

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const [selectedMode, setSelectedMode] = useState('All');
  const [selectedDraftType, setSelectedDraftType] = useState('All');
  const [selectedClass, setSelectedClass] = useState('All');
  const [timeRange, setTimeRange] = useState('all');
  const [levelMin, setLevelMin] = useState(null);
  const [levelMax, setLevelMax] = useState(null);
  const [selectedTiers, setSelectedTiers] = useState([]);

  const [showGlobalFilters, setShowGlobalFilters] = useState(false);

  const resetFilters = () => {
    setSelectedMode('All');
    setSelectedDraftType('All');
    setSelectedClass('All');
    setTimeRange('all');
    setLevelMin(null);
    setLevelMax(null);
    setSelectedTiers([]);
  };

  return (
    <FilterContext.Provider
      value={{
        selectedMode,
        setSelectedMode,
        selectedDraftType,
        setSelectedDraftType,
        selectedClass,
        setSelectedClass,
        timeRange,
        setTimeRange,
        levelMin,
        setLevelMin,
        levelMax,
        setLevelMax,
        selectedTiers,
        setSelectedTiers,
        showGlobalFilters,
        setShowGlobalFilters,
        resetFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}
