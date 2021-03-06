var originalConsoleWarn = console.warn;

console.warn = function(msg) {
  if (msg == "Warning: You should not use a static location in a " +
             "DOM environment because the router will not be kept " +
             "in sync with the current URL") {
    /* This is a warning react-router emits, which is irrelevant to
     * testing scenarios, so we'll squelch it. */
  } else {
    originalConsoleWarn.apply(this, arguments);
  }
};

if (process.env.NODE_ENV === 'production') {
  describe("automated test suite", function() {
    it("does not run when NODE_ENV is 'production'", function() {
      console.log(
        "React's TestUtils aren't available when NODE_ENV is set " +
        "to production, so there's not really any point in running " +
        "the tests. For more information, see:\n\n" +
        "https://facebook.github.io/react/downloads.html#npm"
      );
    });
  });
} else {
  require('./config.test.js');
  require('./page.test.jsx');
  require('./sidebar.test.jsx');
  require('./imagetag.test.jsx');
  require('./teach-api.test.js');
  require('./teach-api-client.test.jsx');
  require('./login.test.jsx');
  require('./modal.test.jsx');
  require('./modal-manager.test.js');
  require('./clubs-page.test.jsx');
  require('./map.test.jsx');
}
