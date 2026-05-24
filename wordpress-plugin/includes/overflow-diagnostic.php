<?php
/**
 * Horizontal-overflow diagnostic for the live frontend.
 *
 * Add ?sb_overflow_diag=1 to any page URL to inject a console-only diagnostic
 * that scans the DOM and reports every element wider than the viewport or
 * extending past its right edge. The top offender is logged as a table and
 * outlined in red so you can spot it visually.
 *
 * Output appears in the browser console under "[SB overflow]".
 * This script ONLY runs when the query var is present, so it is safe to
 * leave shipped in production.
 */
if (!defined('ABSPATH')) exit;

if (!function_exists('schedule_maybe_inject_overflow_diagnostic')) {
function schedule_maybe_inject_overflow_diagnostic() {
    if (empty($_GET['sb_overflow_diag']) || $_GET['sb_overflow_diag'] !== '1') return;
    ?>
    <script>
    (function(){
      function scan(root){
        var doc = root || document;
        var viewport = (doc.documentElement && doc.documentElement.clientWidth) || window.innerWidth;
        var all = Array.prototype.slice.call(doc.querySelectorAll('*'));
        var offenders = [];
        all.forEach(function(el){
          try{
            var rect = el.getBoundingClientRect();
            if (!rect.width && !rect.height) return;
            var rightOverflow = Math.ceil(rect.right - viewport);
            var leftOverflow  = Math.ceil(0 - rect.left);
            var scrollOverflow = Math.ceil((el.scrollWidth || 0) - (el.clientWidth || 0));
            if (rightOverflow > 1 || leftOverflow > 1 || scrollOverflow > 1) {
              var cs = window.getComputedStyle(el);
              offenders.push({
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                cls: (el.className && el.className.toString().slice(0,80)) || '',
                rightOverflow: rightOverflow > 0 ? rightOverflow : 0,
                leftOverflow:  leftOverflow  > 0 ? leftOverflow  : 0,
                scrollOverflow: scrollOverflow > 0 ? scrollOverflow : 0,
                width: Math.round(rect.width),
                rectRight: Math.round(rect.right),
                position: cs.position,
                transform: cs.transform === 'none' ? '' : cs.transform,
                marginRight: cs.marginRight,
                node: el,
              });
            }
          }catch(e){}
        });
        offenders.sort(function(a,b){
          return (b.rightOverflow + b.leftOverflow + b.scrollOverflow) - (a.rightOverflow + a.leftOverflow + a.scrollOverflow);
        });
        return offenders;
      }
      function run(){
        var off = scan(document);
        if (!off.length){
          console.info('[SB overflow] No horizontal overflow detected at viewport',
            document.documentElement.clientWidth, 'px.');
          return;
        }
        console.group('[SB overflow] Top offenders (viewport ' + document.documentElement.clientWidth + 'px)');
        console.table(off.slice(0,20).map(function(o){
          return {tag:o.tag,id:o.id,cls:o.cls,rightOverflow:o.rightOverflow,leftOverflow:o.leftOverflow,scrollOverflow:o.scrollOverflow,width:o.width,rectRight:o.rectRight,position:o.position};
        }));
        off.slice(0,5).forEach(function(o,i){
          try{
            o.node.style.outline = (i===0 ? '3px solid red' : '2px dashed orange');
            o.node.style.outlineOffset = '-2px';
          }catch(e){}
        });
        console.info('[SB overflow] Outlined top 5. Inspect the red one first.');
        console.groupEnd();
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
      } else {
        run();
      }
      // Re-scan after late layout (web fonts, lazy images, sticky headers)
      window.addEventListener('load', function(){ setTimeout(run, 400); });
      window.sbOverflowDiag = run;
    })();
    </script>
    <?php
}
}
add_action('wp_footer', 'schedule_maybe_inject_overflow_diagnostic', 999);
