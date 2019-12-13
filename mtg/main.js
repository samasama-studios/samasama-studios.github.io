$(function(){
    $("#localisations").load("localisations.html");            
});        

$(document).ready(function() {
    var SHOW_NUMBERS = !true;  

    var indexPhase;
    var indexStep;
    var indexAction;
    
    var phaseSteps;
    var stepActions;
    
    var data;
    $.getJSON("turn.json", function(json) {
        data = json;    
    });
    
    setTimeout(function() {
        $('#main').removeClass('d-none');
        $('#loading').addClass('d-none');
        
        reset();
        loadPhases();                
        updateCurrentPhase();
        updateCurrentStep();
        updateCurrentAction();
        updateConnectors();
    }, 1000);            
    
    $('.priority').click(function(e) {
        $('.priority').toggleClass("btn-success");
        $('.priority').toggleClass("btn-danger");
        e.stopPropagation();
    });
    
    $('#main').click(function(e) {                
        //updateActionNext();
    });                        
    
    $('#btn-reset').click(function(e) {
        reset();
        updateConnectors();
        e.stopPropagation();
    });
    
    $('#btn-enter-fullscreen').click(function() {                
        var main = $('#main').get(0);
        enterFullscreen(main);
        
        $("#btn-enter-fullscreen").toggleClass("d-none");
        $("#btn-exit-fullscreen").toggleClass("d-none");
        
        e.stopPropagation();
    });
    
    $('#btn-exit-fullscreen').click(function() {
        reset();
        var main = $('#main').get(0);
        exitFullscreen();
        
        $("#btn-enter-fullscreen").toggleClass("d-none");
        $("#btn-exit-fullscreen").toggleClass("d-none");
        
        e.stopPropagation();
    });
    
    $('#btn-previous').click(function(e) {
        updateActionPrevious();
        updateConnectors();
        e.stopPropagation();
    });
                      
    $('#btn-next').click(function(e) {
        updateActionNext();
        updateConnectors();
        e.stopPropagation();
    });
    
    $('body').on('click', '.btn-phase', function() {
        indexPhase = $(this).val();
        indexStep = 0;
        indexAction = 0;
        
        updateCurrentPhase();
        updateCurrentStep();
        updateCurrentAction();
        updateConnectors();
    });
    
    $('body').on('click', '.btn-step', function() {
        indexStep = $(this).val();
        indexAction = 0;
        
        updateCurrentStep();
        updateCurrentAction();
        updateConnectors();
    });
    
    $('body').on('click', '.btn-action', function() {                
        indexAction = $(this).val();
        
        updateCurrentAction();
        updateConnectors();
    });
    
    function resetButtonsHightlight() {
        resetButtonsPhasesHightlight();
        resetButtonsStepsHightlight();
        resetButtonsActionsHightlight();
    }
    
    function updateCurrentPhase() {                
        resetButtonsHightlight();
        
        var button = $('#btn-phase-' + indexPhase);
        button.removeClass('btn-secondary');
        button.addClass('btn-primary');
        
        $('.btn-phase-' + indexPhase).each(function() {
            $(this).removeClass("d-none");
        });
        
        updateAction();
        updateLabels();
    }            
    
    function resetButtonsPhasesHightlight() {
        $('.btn-phase').each(function() {
            $(this).removeClass('btn-primary');
            $(this).addClass('btn-secondary');
        });                
    }
    
    function updateCurrentStep() {                
        resetButtonsStepsHightlight();
        
        var button = $('#btn-phase-' + indexPhase + '-step-' + indexStep);
        button.removeClass('btn-secondary');
        button.addClass('btn-primary');      
        
        updateAction();
        updateLabels();
    }            
    
    function resetButtonsStepsHightlight() {
        $('.btn-step').each(function() {
            $(this).addClass("d-none");
            $(this).addClass("btn-secondary");
        });
        $('.btn-phase-' + indexPhase).each(function() {
            $(this).removeClass("d-none");
        });
    }   
    
    function updateCurrentAction() {
        resetButtonsActionsHightlight();
        
        var button = $('#btn-phase-' + indexPhase + '-step-' + indexStep + '-action-' + indexAction);                
        button.removeClass('btn-secondary');
        button.addClass('btn-primary');      
        
        updateAction();
        updateLabels();
    }
    
    function resetButtonsActionsHightlight() {
        $('.btn-action').each(function() {
            $(this).addClass("d-none");
            $(this).addClass("btn-secondary");
        });                
        $('.btn-phase-' + indexPhase + '-step-' + indexStep).each(function() {
            $(this).removeClass("d-none");
        });
    }
    
    function loadPhases() {
        var phases = data.phases[indexPhase];
        $.each(data.phases, function(localIndexPhase, phase) {    
            var key = Object.keys(phase)[0]; 
            
            var button = $(document.createElement('button'));
            $(button).prop("type", "button");
            $(button).addClass("btn text-left");
            $(button).addClass("btn-block");
            $(button).addClass("btn-secondary");
            $(button).addClass("btn-phase");
            $(button).prop("id", "btn-phase-" + localIndexPhase);            
            $(button).val(localIndexPhase);
            if (SHOW_NUMBERS) {
                $(button).html((localIndexPhase + 1) + '. ' + $('#' + key).html());
            } else {
                $(button).html($('#' + key).html());
            }
            $('#phases').append(button);
            
            $.each(phase[key], function(localIndexStep, step) {
                key = Object.keys(step)[0];
                
                button = $(document.createElement('button'));
                $(button).prop("type", "button");
                $(button).addClass("btn text-left"); 
                $(button).addClass("btn-secondary");
                $(button).addClass("btn-block");
                $(button).addClass("btn-step");
                $(button).addClass("btn-phase-" + localIndexPhase);
                $(button).prop("id", 'btn-phase-' + localIndexPhase + '-step-' + localIndexStep);   
                $(button).val(localIndexStep);
                if (SHOW_NUMBERS) {
                    $(button).html((localIndexPhase + 1) + '.' + (localIndexStep + 1) + '. ' + $('#' + key).html());
                } else {                
                    $(button).html($('#' + key).html());
                }
                
                $('#steps').append(button);
                
                var stepActions = step[Object.keys(step)[0]];    
                
                for (var localIndexAction = 0; localIndexAction < stepActions.length; localIndexAction++) {
                    key = stepActions[localIndexAction];   
                    
                    button = $(document.createElement('button'));
                    $(button).prop("type", "button");
                    $(button).addClass("btn text-left"); 
                    $(button).addClass("btn-secondary");  
                    $(button).addClass("btn-action");
                    $(button).addClass('btn-phase-' + localIndexPhase + '-step-' + localIndexStep);
                    $(button).prop("id", 'btn-phase-' + localIndexPhase + '-step-' + localIndexStep + '-action-' + localIndexAction);
                    if (SHOW_NUMBERS) {
                        $(button).html((localIndexPhase + 1) + '.' + (localIndexStep + 1) + '.' + (localIndexAction + 1) + '. ' + $('#' + key).html());
                    } else {
                        $(button).html($('#' + key).html());
                    }                    
                    $(button).val(localIndexAction);
                    
                    $('#actions').append(button);
                }                        
            });
        });                
    }            
    
    function enterFullscreen(element) {
        if(element.requestFullscreen)
            element.requestFullscreen();
        else if(element.mozRequestFullScreen)
            element.mozRequestFullScreen();
        else if(element.webkitRequestFullscreen)
            element.webkitRequestFullscreen();
        else if(element.msRequestFullscreen)
            element.msRequestFullscreen();
    }
    
    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
    
    function updateActionNext() {
        if (indexAction < stepActions.length - 1) {
            indexAction++;
        } else {
            indexAction = 0;
            if (indexStep < phaseSteps.length - 1) {
                indexStep++;
            } else {
                indexStep = 0;
                if (indexPhase < data.phases.length - 1) {
                    indexPhase++;
                } else {
                    indexPhase = 0;                            
                }
            }
        }
        
        updateCurrentPhase();
        updateCurrentStep();
        updateCurrentAction();
        updateAction();
        updateLabels();
    }
    
    function updateActionPrevious() {
        if (indexAction > 0) {
            indexAction--;
        } else {
            if (indexStep > 0) {
                indexStep--;
            } else {
                if (indexPhase > 0) {
                    indexPhase--;    
                } else {                            
                    indexPhase = data.phases.length - 1;      
                }
                updateAction();
                indexStep = phaseSteps.length - 1;
            }                    
            updateAction();
            indexAction = stepActions.length - 1;
        }                
        
        updateCurrentPhase();
        updateCurrentStep();
        updateCurrentAction();
        updateAction();
        updateLabels();
    }
    
    function reset() {
        indexAction = 0;
        indexStep = 0;
        indexPhase = 0;
        
        updateCurrentPhase();
        updateCurrentStep();
        updateCurrentAction();
        updateAction();
        updateLabels();        
    }
    
    function updateLabels() {                
        var key = Object.keys(data.phases[indexPhase])[0];
        var text = $("#" + key).text();
        if (SHOW_NUMBERS) {
            text = (indexPhase + 1) + ") " + text;
        }
        $("#phase").text(text);
        
        var key = Object.keys(phaseSteps[indexStep])[0];
        text = $("#" + key).text();
        if (SHOW_NUMBERS) {
            text = (indexPhase + 1) + "." + (indexStep + 1) + ") " + text;
        }
        $("#step").text(text);                
        
        text = $("#" + stepActions[indexAction]).text();
        if (SHOW_NUMBERS) {
            text = (indexPhase + 1) + "." + (indexStep + 1) + "." + (indexAction + 1) + ") " + text;
        }
        //$("#action").text(text);
        
        $("#page").text((indexAction + 1) + " / " + stepActions.length);
    }    
    
    function createLine(x1, y1, x2, y2) {
        return d3.select("#lines").append("line")
            .attr("x1", x1)
            .attr("y1", y1)
            .attr("x2", x2)
            .attr("y2", y2)
            .attr("stroke", "#007bff")
            .attr("stroke-width", "3");
    }
    
    function createConnectorBetweenElements(element1, element2) {        
        var element1Right = $(element1).get(0).getBoundingClientRect().right;
        var element1MidY = ($(element1).get(0).getBoundingClientRect().top + $(element1).get(0).getBoundingClientRect().bottom) / 2;
        
        var element2Left = $(element2).get(0).getBoundingClientRect().left;
        var element2MidY = ($(element2).get(0).getBoundingClientRect().top + $(element2).get(0).getBoundingClientRect().bottom) / 2;
        
        var midX = (element1Right + element2Left) / 2;
        createLine(element1Right, element1MidY, midX, element1MidY);
        createLine(midX, element2MidY, element2Left, element2MidY);
        createLine(midX, element1MidY, midX, element2MidY);
    }
    
    function updateConnectors() {
        $('#lines').empty();
        
        var btnPhase = $('#btn-phase-' + indexPhase);
        var btnStep = $('#btn-phase-' + indexPhase + '-step-' + indexStep);
        var btnAction = $('#btn-phase-' + indexPhase + '-step-' + indexStep + '-action-' + indexAction); 
        
        createConnectorBetweenElements(btnPhase, btnStep);
        createConnectorBetweenElements(btnStep, btnAction);
    }
    
    function updateAction() {
        var phase = data.phases[indexPhase];                
        
        var key = Object.keys(phase)[0];
        phaseSteps = phase[key];
        //console.debug('phase=' + key);
        
        var step = phaseSteps[indexStep];                
        key = Object.keys(step)[0]; 
        stepActions = step[key];
        //console.debug('step=' + key);
        
        var action = stepActions[indexAction];
        //console.debug('action=' + action);
    }          
});    