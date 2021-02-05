(function($){

	"use strict";

	var fullHeight = function() {

		$('.js-fullheight').css('height', $(window).height());
		$(window).resize(function(){
			$('.js-fullheight').css('height', $(window).height());
		});

	};
	fullHeight();

	$('#sidebarCollapse').on('click', function () {
	  $('#sidebar').toggleClass('active');

	  //FORMAT TABLE
	  document.getElementsByTagName("table")[0].removeAttribute("style");
	  document.getElementsByClassName("fixed-table-border")[1].removeAttribute("style");
	  document.getElementsByTagName("table")[2].removeAttribute("style");

  });

})(jQuery);
