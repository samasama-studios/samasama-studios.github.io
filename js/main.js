$(document).ready(function() {
    
    var firstSection = $("#about");
    var firstSectionHeaderTop = $(firstSection).find("header").offset().top;
    var firstSectionHeaderBottom = firstSectionHeaderTop + $(firstSection).find("header").outerHeight();
    var currentSection = firstSection;
    var navbar = $("#navbar");    
    
    window.onscroll = function() {
        updateSticky();
    };    
    
    function updateSticky() {
        var navbarBottom = window.pageYOffset + $(navbar).outerHeight();
        
        // Show/hide the navbar.
        if (firstSectionHeaderBottom <= window.pageYOffset) {
            anime({
                targets: "#navbar",
                opacity: 1,
                duration: 500
            });
        } else {
            anime({
                targets: "#navbar",
                opacity: 0,
                duration: 500
            });
        }       
        
        // Calculate current section.
        $("section").each(function() {            
            var sectionBottom = $(this).offset().top + $(this).outerHeight(true);
            var sectionHeader = $(this).find("header");           
            
            if (navbarBottom >= $(sectionHeader).offset().top && window.pageYOffset < sectionBottom) {
                currentSection = $(this);
                return false;
            }
        });
        
        // Little hack for about section without color.
        var sectionColor = $(currentSection).find("header").css("background-color");
        if (sectionColor == "rgba(0, 0, 0, 0)") {
            sectionColor = "#10100F";
        }
        
        // Apply current section color.
        anime({
            targets: "#navbar",
            backgroundColor: sectionColor, 
            duration: 500
        });
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