import { useState, useCallback } from "react";

/**
 * Reusable useModalState Hook
 * Standardizes modal visibility state and item data context across forms and details modals.
 *
 * @param {boolean} initialState Initial visibility state (default: false)
 */
export const useModalState = (initialState = false) => {
  const [isOpen, setIsOpen] = useState(initialState);
  const [modalData, setModalData] = useState(null);

  const openModal = useCallback((data = null) => {
    setModalData(data);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setModalData(null);
  }, []);

  const toggleModal = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    modalData,
    openModal,
    closeModal,
    toggleModal,
    setIsOpen,
    setModalData,
  };
};

export default useModalState;
