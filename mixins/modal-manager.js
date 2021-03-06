var React = require('react');
var ga = require('../lib/googleanalytics.js');

module.exports = {
  contextTypes: {
    showModal: React.PropTypes.func.isRequired,
    hideModal: React.PropTypes.func.isRequired
  },
  showModal: function(modalClass, modalProps) {
    ga.modalview(modalClass.displayName);
    this.context.showModal(modalClass, modalProps);
  },
  hideModal: function() {
    this.context.hideModal();
  }
};
