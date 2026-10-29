// Wraps an async controller so a rejected promise reaches Express's error
// handler instead of becoming an unhandled rejection.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
};
