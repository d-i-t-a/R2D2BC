// eslint-disable-next-line no-undef
jQuery(function ($) {
  const $bodyEl = $("body"),
    $sidedrawerEl = $("#sidedrawer"),
    $sidedrawerRightEl = $("#sidedrawerRight"),
    $sidedrawer2El = $("#sidedrawer2"),
    $sidedrawer3El = $("#sidedrawer3"),
    $sidedrawer4El = $("#sidedrawer4"),
    $sidedrawer5El = $("#sidedrawer5"),
    $sidedrawer6El = $("#sidedrawer6"),
    $sidedrawer7El = $("#sidedrawer7"),
    $sidedrawer8El = $("#sidedrawer8");

  // ==========================================================================
  // Toggle Sidedrawer
  // ==========================================================================
  function showSidedrawer() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawerEl.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawerEl.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawerEl.addClass("active");
    }, 20);
  }

  function hideSidedrawer() {
    $bodyEl.toggleClass("hide-sidedrawer");
  }
  function showSidedrawerRight() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawerRightEl.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawerRightEl.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawerRightEl.addClass("active");
    }, 20);
  }

  function showSidedrawer2() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawer2El.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawer2El.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawer2El.addClass("active");
    }, 20);
  }
  function showSidedrawer3() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawer3El.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawer3El.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawer3El.addClass("active");
    }, 20);
  }
  function showSidedrawer4() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawer4El.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawer4El.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawer4El.addClass("active");
    }, 20);
  }
  function showSidedrawer5() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawer5El.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawer5El.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawer5El.addClass("active");
    }, 20);
  }
  function showSidedrawer6() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawer6El.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawer6El.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawer6El.addClass("active");
    }, 20);
  }
  function showSidedrawer7() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawer7El.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawer7El.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawer7El.addClass("active");
    }, 20);
  }
  function showSidedrawer8() {
    // show overlay
    let options = {
      onclose: function () {
        $sidedrawer8El.removeClass("active").appendTo(document.body);
      },
    };

    // eslint-disable-next-line no-undef
    const $overlayEl = $(mui.overlay("on", options));

    // show element
    $sidedrawer8El.appendTo($overlayEl);
    setTimeout(function () {
      $sidedrawer8El.addClass("active");
    }, 20);
  }

  $(".js-show-sidedrawer").on("click", showSidedrawer);
  $(".js-hide-sidedrawer").on("click", hideSidedrawer);
  $(".js-show-sidedrawerRight").on("click", showSidedrawerRight);
  $(".js-hide-sidedrawerRight").on("click", hideSidedrawer);
  $(".js-show-sidedrawer2").on("click", showSidedrawer2);
  $(".js-hide-sidedrawer2").on("click", hideSidedrawer);
  $(".js-show-sidedrawer3").on("click", showSidedrawer3);
  $(".js-hide-sidedrawer3").on("click", hideSidedrawer);
  $(".js-show-sidedrawer4").on("click", showSidedrawer4);
  $(".js-hide-sidedrawer4").on("click", hideSidedrawer);
  $(".js-show-sidedrawer5").on("click", showSidedrawer5);
  $(".js-hide-sidedrawer5").on("click", hideSidedrawer);
  $(".js-show-sidedrawer6").on("click", showSidedrawer6);
  $(".js-hide-sidedrawer6").on("click", hideSidedrawer);
  $(".js-show-sidedrawer7").on("click", showSidedrawer7);
  $(".js-hide-sidedrawer7").on("click", hideSidedrawer);
  $(".js-show-sidedrawer8").on("click", showSidedrawer8);
  $(".js-hide-sidedrawer8").on("click", hideSidedrawer);

  // ==========================================================================
  // Animate menu
  // ==========================================================================
  const $titleEls = $("strong", $sidedrawerEl);

  $titleEls.next().hide();

  $titleEls.on("click", function () {
    $(this).next().slideToggle(200);
  });
});
