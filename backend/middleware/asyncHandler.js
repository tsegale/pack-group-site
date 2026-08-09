/* Express 4 does not forward rejected promises from async handlers to the
   error middleware on its own — this wrapper does that so a thrown/rejected
   error in any `async (req, res) => {}` handler reaches app.use((err, ...)). */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
