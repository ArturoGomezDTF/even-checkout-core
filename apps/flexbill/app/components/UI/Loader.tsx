const Loader = () => {
  return (
    <div className="fixed inset-0 z-50 bg-even-evergreen flex items-center justify-center">
      <div className="text-center">
        <div>
          <img
            src="/even/even-asterisk-grass.svg"
            alt="Even"
            className="asterisk-spin w-20 h-20 md:w-24 md:h-24 justify-self-center"
          />
        </div>
      </div>
    </div>
  );
};

export default Loader;
