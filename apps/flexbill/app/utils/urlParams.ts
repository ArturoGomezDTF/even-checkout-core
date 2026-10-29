export const saveUrlParams = () => {
  if (typeof window !== 'undefined') {
    const params = window.location.search;
    if (params) {
      sessionStorage.setItem('savedUrlParams', params);
    }
  }
};

export const getSavedUrlParams = () => {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('savedUrlParams') || '';
  }
  return '';
};

export const clearSavedUrlParams = () => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('savedUrlParams');
  }
};