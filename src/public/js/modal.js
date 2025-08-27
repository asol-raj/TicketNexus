/**
 * Creates and returns a Bootstrap 5 modal.
 * The modal is automatically removed from the DOM when hidden.
 *
 * @param {string} title - The title to display in the modal header.
 * @param {string} [size=''] - The size of the modal. Can be 'sm', 'lg', 'xl', or empty for default.
 * @returns {jQuery} - The jQuery object of the created modal element.
 */
function showModal(title, size = "lg") {
  // Determine the modal dialog size class
  let sizeClass = "";
  if (size) {
    sizeClass = `modal-${size}`;
  }

  // Construct the modal HTML
  const modalHtml = `
        <div class="modal fade" tabindex="-1" role="dialog" aria-labelledby="modalTitle" aria-hidden="true">
            <div class="modal-dialog  modal-dialog-scrollable ${sizeClass}" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="modalTitle">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary apply d-none">Apply</button>
                    </div>
                </div>
            </div>
        </div>
    `;

  // Create the modal element using jQuery
  const $modal = $(modalHtml);

  // Append the modal to the body
  $("body").append($modal);

  // Initialize the Bootstrap modal instance
  const bsModal = new bootstrap.Modal($modal[0]);

  // Add an event listener to remove the modal from the DOM when it's hidden
  $modal.on("hidden.bs.modal", function () {
    $modal.remove(); // Remove the modal element from the DOM
  });

  // You can also choose to show the modal immediately here if you want:
  // bsModal.show();
  // However, for more control, it's often better to return the jQuery object
  // and let the caller decide when to show it.

  // Store the Bootstrap modal instance on the jQuery object for easy access if needed
  $modal.data("bs.modal", bsModal);

  return $modal;
}

export default showModal;

// Example Usage:
// Assuming you have jQuery and Bootstrap 5 JS loaded

// 1. Create a default-sized modal
// const myModal = showModal('My First Modal', '');
// myModal.find('.modal-body').text('This is the content of my first modal.');
// myModal.data('bs.modal').show(); // Show the modal

// 2. Create a large modal
// const largeModal = showModal('Large Modal Example', 'lg');
// largeModal.find('.modal-body').html('<p>This is a <strong>large</strong> modal!</p>');
// largeModal.data('bs.modal').show();

// 3. Create an extra-large modal for dynamic content
// const xlModal = showModal('XL Modal for Data', 'xl');
// xlModal.find('.modal-body').append('<ul><li>Item 1</li><li>Item 2</li></ul>');
// xlModal.data('bs.modal').show();
