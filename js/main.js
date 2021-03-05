$(document).ready(function() {
    
    if (location.pathname != "/contact.html") {
        var firstSection = $(".first");
        var firstSectionHeaderTop = $(firstSection).find("header").offset().top;
        var firstSectionHeaderBottom = firstSectionHeaderTop + $(firstSection).find("header").outerHeight();
        var currentSection = firstSection;
        var navbar = $("#navbar");    

        window.onscroll = function() {
            updateSticky();
            
//            console.log(currentSection);
        };    

        function updateSticky() {
            var navbarBottom = window.pageYOffset + $(navbar).outerHeight();

            // Show/hide the navbar icon
            if (firstSectionHeaderBottom <= window.pageYOffset) {
                anime({
                    targets: "#navbar-icon",
                    opacity: 1,
                    duration: 300
                });
                anime({
                    targets: "#navbar",
                    background: 'rgba( 239, 240, 235, 0.20)',
                    duration: 250
                });
                
            } else {
                anime({
                    targets: "#navbar",
                    background: 'none',
                    duration: 200
                });
                
                anime({
                    targets: "#navbar-icon",
                    opacity: 0,
                    duration: 250
                });

                anime({
                    targets: '#navbar-icon .atom',
                    stroke: '#F26A25',
                    easing: 'easeInCirc',
                    duration: 100
                });               
            }
            
            //Calculate current section.
//            $("section").each(function() {            
//                var sectionBottom = $(this).offset().top + $(this).outerHeight(true);
//                var sectionHeader = $(this).find(".mark");           
//
//                if (navbarBottom >= $(sectionHeader).offset().top && window.pageYOffset < sectionBottom) {
//                    currentSection = $(this);
//                    return false;
//                }
//            });
        }
        
    }    
    
    $(document).on('click', 'a[href^="#"]', function (event) {
        event.preventDefault();
        $('html, body').animate({
            scrollTop: $($.attr(this, 'href')).offset().top - $(navbar).outerHeight()
        }, 500);
    });
    
        
/////////////////////////////////////////////////////////////////////
////////////////////  + link underline effect  //////////////////////
/////////////////////////////////////////////////////////////////////    
    
    function underlineAnim(link, e, index) {
        let underline = link.querySelector(".underline");

        anime({
            targets: underline,
            width: "100%",
            left: "0%",
            easing: 'easeOutQuint'
        });
    }

    function leaveUnderlineAnim(link, e) {
        let underline = link.querySelector(".underline");

        anime({
            targets: underline,
            width: "0%",
            left: "0%",
            easing: 'easeInQuint'
        });
    }

    // Get all links
    let workLinks = document.querySelectorAll(".link");
    
    workLinks.forEach(activateLinks);

    function activateLinks(link, index, value) {
        
        link.addEventListener("mouseenter", function(e) {
            underlineAnim(link, e);
        });

        link.addEventListener("mouseleave", function(e) {
            leaveUnderlineAnim(link, e);
        });
    }
/////////////////////////////////////////////////////////////////////
////////////////////  - link underline effect  //////////////////////
/////////////////////////////////////////////////////////////////////
   

});
