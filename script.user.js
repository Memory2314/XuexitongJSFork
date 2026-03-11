// ==UserScript==
// @name         XuexitongJSFork 学习通一键全自动刷课
// @namespace    https://github.com/Memory2314/XuexitongJSFork
// @version      1.0
// @description  自动识别课程树结构、自动播放视频、自动回答互动题目、自动切换倍速、自动检测PDF并翻页。注意事项：目前单一章节只识别第一个视频/PDF元素；对非视频/PDF类型课程会尝试直接跳过。
// @author       Memory2314
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://mooc2.chaoxing.com/mycourse/studentstudy*
// @match        *://i.chaoxing.com/base*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Memory2314/XuexitongJSFork/main/script.meta.js
// @downloadURL  https://raw.githubusercontent.com/Memory2314/XuexitongJSFork/main/script.user.js
// @require      https://cdn.jsdelivr.net/npm/layui@2.13.4/dist/layui.js
// ==/UserScript==

(function () {
  "use strict";

  // 可通过油猴菜单或 GM_setValue 修改以下配置：
  // FORCE_SPEED: true=强制倍速, false=不强制
  // SPEED: 倍速值，如 1.5 / 2 / 3
  const DEFAULT_SPEED_OPTION = GM_getValue("FORCE_SPEED", false);
  const DEFAULT_SPEED = GM_getValue("SPEED", 2);
  let AUTO_MUTE = GM_getValue("AUTO_MUTE", true);
  let AUTO_ANSWER = GM_getValue("AUTO_ANSWER", true);
  let AUTO_PDF = GM_getValue("AUTO_PDF", true);
  let AUTO_AUDIO = GM_getValue("AUTO_AUDIO", true);

  GM_registerMenuCommand("设置倍速", function () {
    openSettingsDialog();
  });
  GM_registerMenuCommand("切换强制倍速", function () {
    const cur = GM_getValue("FORCE_SPEED", false);
    GM_setValue("FORCE_SPEED", !cur);
    xxtNotify("强制倍速已" + (!cur ? "开启" : "关闭") + "，刷新页面生效", 1);
  });
  GM_registerMenuCommand("切换自动静音", function () {
    AUTO_MUTE = !AUTO_MUTE;
    GM_setValue("AUTO_MUTE", AUTO_MUTE);
    const muteEl = document.getElementById("xxt-mute-switch");
    if (muteEl) muteEl.checked = AUTO_MUTE;
    xxtNotify("自动静音已" + (AUTO_MUTE ? "开启" : "关闭"), 1);
  });
  GM_registerMenuCommand("切换自动答题", function () {
    AUTO_ANSWER = !AUTO_ANSWER;
    GM_setValue("AUTO_ANSWER", AUTO_ANSWER);
    const el = document.getElementById("xxt-answer-switch");
    if (el) el.checked = AUTO_ANSWER;
    xxtNotify("自动答题已" + (AUTO_ANSWER ? "开启" : "关闭"), 1);
  });
  GM_registerMenuCommand("切换自动翻页PDF", function () {
    AUTO_PDF = !AUTO_PDF;
    GM_setValue("AUTO_PDF", AUTO_PDF);
    const el = document.getElementById("xxt-pdf-switch");
    if (el) el.checked = AUTO_PDF;
    xxtNotify("自动翻页PDF已" + (AUTO_PDF ? "开启" : "关闭"), 1);
  });
  GM_registerMenuCommand("切换自动播放音频", function () {
    AUTO_AUDIO = !AUTO_AUDIO;
    GM_setValue("AUTO_AUDIO", AUTO_AUDIO);
    const el = document.getElementById("xxt-audio-switch");
    if (el) el.checked = AUTO_AUDIO;
    xxtNotify("自动播放音频已" + (AUTO_AUDIO ? "开启" : "关闭"), 2);
  });

  console.log("强制倍速选项:", DEFAULT_SPEED_OPTION);
  console.log("默认倍速:", DEFAULT_SPEED);

  const DEFAULT_SLEEP_TIME = 400 + Math.floor(Math.random() * 200); // 默认延迟400-600ms
  const DEFAULT_INTERVAL_TIME = 85 + Math.floor(Math.random() * 30); // 默认轮询间隔85-115ms

  const DEFAULT_TRY_COUNT = 50; // 默认最大尝试次数50次

  const COURSE_TREE_ID = "coursetree";
  const COURSE_TREE_NODE_FEATURE_CLASS = "div.posCatalog_select";
  const COURSE_TREE_NODE_TITLE_FEATURE_CLASS = "span.posCatalog_title";
  const COURSE_TREE_NODE_CURRENT_FEATURE_CLASS = "posCatalog_active";
  const COURSE_TREE_NODE_INTERACT_FEATURE_CLASS = "span.posCatalog_name";

  const VIDEO_IFRAME_ID = "video";
  const VIDEO_QUESTION_ID = "ext-comp-1046";
  const VIDEO_QUESTION_COMPLETE_ID = "videoquiz-continue";
  const VIDEO_QUESTION_SUBMITTING_ID = "videoquiz-submitting";
  const VIDEO_PLAY_FEATURE_CLASS = ".vjs-play-control";
  const VIDEO_ENDED_FEATURE_CLASS = "vjs-ended";
  const VIDEO_IFRAME_FEATURE_CLASS = "ans-insertvideo-online";
  const VIDEO_LAUNCH_FEATURE_CLASS = ".vjs-big-play-button";
  const VIDEO_PAUSED_FEATURE_CLASS = "vjs-paused";
  const VIDEO_MUTEBTN_FEATURE_CLASS = ".vjs-mute-control";
  const VIDEO_PACELIST_FEATURE_CLASS = "li.vjs-menu-item";
  const VIDEO_HAS_LAUNCHED_FEATURE_CLASS = "vjs-has-started";
  const VIDEO_PACE_SELECTED_FEATURE_CLASS = "vjs-menu-item-selected";
  const VIDEO_QUESTION_SUBMIT_FEATURE_CLASS = ".ans-videoquiz-submit";
  const VIDEO_QUESTION_RADIOS_FEATURE_CLASSES =
    '.tkItem_ul .ans-videoquiz-opt input[type="radio"]';
  const VIDEO_QUESTION_CHECKBOXES_FEATURE_CLASSES =
    '.tkItem_ul .ans-videoquiz-opt input[type="checkbox"]';

  const PDF_IFRAME_ID = "panView";
  const PDF_DOC_FEATURE_CLASS = "insertdoc-online-pdf";

  const AUDIO_IFRAME_FEATURE_CLASS = "ans-insertaudio";
  const AUDIO_PLAYER_ID = "audio";
  const AUDIO_ELEMENT_ID = "audio_html5_api";

  const IFRAME_LOADING_URL = "about:blank";
  const NEXTBTN_ID = "prevNextFocusNext";
  const OUTER_IFRAME_ID = "iframe";
  const INNER_COURSE_IFRAME_FEATURE_CLASS = "ans-attach-online";
  const IFRAME_MAIN_FEATURE_CLASS = ".content"; // 适配左右目录布局

  let allTaskDown = false;
  let courseTree = [];
  let courseTreeIndex = 0;
  let nextLock = false;
  let skipSign = 0;
  let answerTable = [];
  let handleIframeLock = false;
  let nextCooldown = false;
  let videoLock = false; // 视频锁，防止多次点击播放按钮
  let hasEnterdct2 = false; // 临时补丁，防止多次进入测验题目处理流程

  function getCourseTree() {
    const courseTree = [];
    const treeDiv = document.getElementById(COURSE_TREE_ID);
    if (!treeDiv) {
      console.warn(`未找到id为${COURSE_TREE_ID}的div`);
      return courseTree;
    }
    const nodes = treeDiv.querySelectorAll(COURSE_TREE_NODE_FEATURE_CLASS);
    nodes.forEach((node) => {
      courseTree.push(node);
    });

    return courseTree;
  }

  function findCourseTree() {
    courseTree = getCourseTree();
    if (courseTree.length === 0) {
      console.error("未找到课程树, 请检查页面结构或联系作者");
    }
  }

  function nodeType(node) {
    const span = node.querySelector(COURSE_TREE_NODE_INTERACT_FEATURE_CLASS);
    if (!span) {
      console.warn("未找到span.posCatalog_name");
      const titleSpan = node.querySelector(
        COURSE_TREE_NODE_TITLE_FEATURE_CLASS,
      );
      if (titleSpan) {
        console.log("使用span.posCatalog_title作为标题");
        return "Title";
      }
      return "Unknown";
    } else {
      if (span.onclick == null) {
        return "Block";
      } else {
        const pending = node.querySelector(".orangeNew");
        if (pending) {
          return "Pending";
        } else {
          return "Finished";
        }
      }
    }
  }

  function nextCourse() {
    if (courseTreeIndex < courseTree.length) {
      return courseTree[courseTreeIndex++];
    } else {
      return null;
    }
  }

  function initializeTreeIndex() {
    let node;
    courseTreeIndex = 0;
    while ((node = nextCourse())) {
      if (node.classList.contains(COURSE_TREE_NODE_CURRENT_FEATURE_CLASS)) {
        console.log(
          "已找到当前激活的课程节点:",
          node.querySelector(COURSE_TREE_NODE_INTERACT_FEATURE_CLASS).title,
        );
        courseTreeIndex--;
        return node.querySelector(COURSE_TREE_NODE_INTERACT_FEATURE_CLASS)
          .title;
      }
    }
    console.error("初始化错误, 未找到激活的课程节点");
  }

  function timeSleep(time) {
    time = time + Math.floor(Math.random() * 50);
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  function waitForElement(
    getter,
    callback,
    interval = DEFAULT_INTERVAL_TIME,
    maxTry = DEFAULT_TRY_COUNT,
  ) {
    let tryCount = 0;
    let stopped = false;
    function tryFind() {
      if (stopped) return;
      let el = null;
      try {
        el = getter();
      } catch (e) {
        // 捕获 DeadObject 或跨域等异常
        console.warn("[waitForElement] getter 异常，终止本轮检测", e);
        stopped = true;
        callback(null);
        return;
      }
      if (el) {
        callback(el);
      } else if (tryCount < maxTry) {
        tryCount++;
        setTimeout(tryFind, interval);
      } else {
        callback(null);
      }
    }
    tryFind();
    // 返回一个停止函数，供外部取消
    return () => {
      stopped = true;
    };
  }

  function continueToNextChapter() {
    if (nextLock || nextCooldown) {
      console.log("[锁] 跳转冷却中，跳过本次 continueToNextChapter");
      return;
    }
    nextLock = true;
    nextCooldown = true; // 进入冷却

    // ...原有跳转逻辑...

    // 跳转后冷却，比如5秒
    setTimeout(() => {
      nextCooldown = false;
      console.log("章节跳转冷却结束");
    }, 10 * DEFAULT_SLEEP_TIME);

    const nextBtn = document.getElementById(NEXTBTN_ID);

    if (nextBtn) {
      if (nextBtn.style.display === "none") {
        xxtDialog("🎉 所有课程已完成！", "完成");
        allTaskDown = true;
        nextLock = false;
        return;
      }
    } else {
      nextLock = false;
      throw new Error("元素缺失, 已终止");
    }

    findCourseTree(); //由于此时课程树有元素变化（主要是COURSE_TREE_NODE_CURRENT_FEATURE_CLASS），需要刷新
    let currentTitle = initializeTreeIndex();
    let nextCourseNode = nextCourse();
    let skippedCount = 0;
    while (
      nodeType(nextCourseNode) !== "Unknown" &&
      nodeType(nextCourseNode) !== "Pending"
    ) {
      const nameSpan = nextCourseNode.querySelector(
        COURSE_TREE_NODE_INTERACT_FEATURE_CLASS,
      );
      const titleSpan = nextCourseNode.querySelector(
        COURSE_TREE_NODE_TITLE_FEATURE_CLASS,
      );
      const title = nameSpan?.title ?? titleSpan?.title ?? "未知标题";
      console.log("跳过已完成和锁定课程/目录:", title);
      nextCourseNode = nextCourse();
      if (!nextCourseNode) {
        break;
      }
      skippedCount++;
    }
    if (nextCourseNode) {
      let nextChapter = nextCourseNode.querySelector(
        COURSE_TREE_NODE_INTERACT_FEATURE_CLASS,
      );
      console.log("正在跳转到下一课程:", nextChapter.title);
      if (nextChapter) {
        if (currentTitle === nextChapter.title) {
          let aimNode = nextCourse();
          console.log("当前章节已激活，跳过");
          while (
            nodeType(aimNode) !== "Unknown" &&
            nodeType(aimNode) !== "Pending"
          ) {
            console.log("执行章节跳转循环中...");
            aimNode = nextCourse();
            if (!aimNode) {
              xxtDialog(
                "未找到下一个课程节点，可能是课程已全部完成或结构异常，脚本已退出。",
                "结束",
              );
              allTaskDown = true;
              nextLock = false;
              return;
            }
            skippedCount++;
          }
          nextChapter = aimNode.querySelector(
            COURSE_TREE_NODE_INTERACT_FEATURE_CLASS,
          );
          console.log("循环执行完毕，正在跳转到下一课程:", nextChapter.title);
        }
        if (nextChapter) {
          timeSleep(DEFAULT_SLEEP_TIME).then(() => {
            console.log("即将跳转到下一章节");
            nextChapter.click();
            console.log("已点击章节:", nextChapter.title);
            nextLock = false;
          });
        } else {
          xxtDialog(
            "未找到下一个课程节点，可能是课程已全部完成或结构异常，脚本已退出。",
            "结束",
          );
          allTaskDown = true;
          nextLock = false;
        }
      } else {
        xxtDialog("🎉 所有课程已完成！", "完成");
        allTaskDown = true;
        nextLock = false;
      }
    } else {
      xxtDialog(
        "未找到下一个课程节点，可能是课程已全部完成或结构异常，脚本已退出。",
        "结束",
      );
      allTaskDown = true;
      nextLock = false;
    }
  }

  function findOuterDoc() {
    const outerIframe = document.getElementById(OUTER_IFRAME_ID);
    if (!outerIframe) return null;
    let outerDoc;
    try {
      outerDoc =
        outerIframe.contentDocument || outerIframe.contentWindow.document;
    } catch (e) {
      console.warn("跨域, 无法访问iframe内容");
      return null;
    }
    if (!outerDoc) {
      console.log("[调试] 未找到 outerDoc");
      return null;
    }
    if (outerDoc.location.href === IFRAME_LOADING_URL) {
      console.log("[调试] outerDoc 仍为 about:blank,等待加载");
      return null;
    }
    console.log("已找到 outerDoc:", outerDoc);
    return outerDoc;
  }

  function findInnerDocs(outerDoc) {
    const innerIframes = Array.from(outerDoc.querySelectorAll("iframe")).filter(
      (iframe) =>
        iframe.classList?.contains(INNER_COURSE_IFRAME_FEATURE_CLASS) ||
        iframe.src?.includes("ananas/modules/work"), // 满足 src 包含特定路径
    );
    const result = [];
    console.log("开始核对");
    const needSkip = outerDoc.querySelectorAll(".ans-job-icon");
    if (needSkip?.length > 1 && innerIframes.length < needSkip.length) {
      console.warn(
        "检测到测验题目数量小于课程内实际测验题目数量不符，将重新回调",
        needSkip.length,
        innerIframes.length,
      );
      return null;
    }
    innerIframes.forEach((innerIframe) => {
      let Type = "";
      let innerDoc;

      // 判断 iframe 类型
      if (innerIframe.classList.contains(VIDEO_IFRAME_FEATURE_CLASS)) {
        Type = "Video";
      } else if (innerIframe.classList.contains(PDF_DOC_FEATURE_CLASS)) {
        Type = "Pdf";
      } else if (innerIframe.classList.contains(AUDIO_IFRAME_FEATURE_CLASS)) {
        Type = "Audio";
      } else if (innerIframe.src?.includes("/ananas/modules/work/")) {
        Type = "Work";
      } else {
        Type = "Unknown";
      }

      // 获取 innerDoc
      try {
        innerDoc =
          innerIframe.contentDocument || innerIframe.contentWindow.document;
        if (!innerDoc) {
          console.log("[调试] 未找到 innerDoc");
          throw new Error("innerDoc 未找到"); // 抛出异常，跳转到 catch
        }

        if (innerDoc.location.href === IFRAME_LOADING_URL) {
          console.log("[调试] innerDoc 仍为 about:blank, 等待加载");
          throw new Error("innerDoc 加载中");
        }
      } catch (e) {
        console.warn("[备用] 跨域, 无法访问 iframe 内容");
        return null;
      }
      result.push({ innerDoc, Type });
    });
    if (result.length === 0) {
      console.log("[调试] 尝试检测测验题目");
      // 备用手段：尝试查找 src 包含 /ananas/modules/work/ 的 iframe
      const workIframe = Array.from(outerDoc.querySelectorAll("iframe")).find(
        (iframe) => iframe.src?.includes("/ananas/modules/work/"),
      );
      if (workIframe) {
        try {
          let workDoc;
          try {
            workDoc =
              workIframe.contentDocument || workIframe.contentWindow.document;
          } catch (e) {
            console.warn("[备用] 获取 workDoc 失败", e);
            return null;
          }
          console.log("[备用] workDoc:", workDoc);
          if (!workDoc) {
            console.warn("[备用] workDoc 为 null");
            return null;
          } else if (workDoc.location.href === IFRAME_LOADING_URL) {
            console.warn("[备用] workDoc 仍为 about:blank");
            return null;
          } else {
            console.log("[备用] 通过 src 查找到了 work iframe innerDoc");
            result.push({ innerDoc: workDoc, Type: "Work" });
          }
        } catch (e) {
          console.warn("[备用] 跨域, 无法访问 work iframe 内容");
          return null;
        }
      } else {
        console.log("[备用] 未找到 work iframe");
        return null;
      }
    }
    console.log("再次核对");
    if (needSkip?.length > 1 && result.length < needSkip.length) {
      console.warn(
        "检测到测验题目数量小于课程内实际测验题目数量不符，将重新回调",
      );
      return null;
    }
    return result;
  }

  function muteVideo(muteBtn) {
    if (muteBtn) {
      if (muteBtn.title === "取消静音") {
        console.log("已是静音状态，跳过");
      } else if (muteBtn.title === "静音") {
        muteBtn.click();
        console.log("已自动点击静音按钮");
      } else {
        console.warn("静音按钮的title未知:", muteBtn.title);
      }
    } else {
      console.warn("未找到静音按钮元素");
    }
  }

  function selectMenuItem(paceList) {
    // 2x > 1.5x > 1.25x
    const targets = ["2x", "1.5x", "1.25x"];
    let found = null;
    for (const speed of targets) {
      found = Array.from(paceList).find((li) => li.textContent.includes(speed));
      if (found) break;
    }
    if (found) {
      found.click();
      timeSleep(DEFAULT_SLEEP_TIME).then(() => {
        if (found.classList.contains(VIDEO_PACE_SELECTED_FEATURE_CLASS)) {
          console.log("已自动选择菜单项:", found);
        } else {
          console.warn("点击后未能成功选择菜单项:", found);
        }
      });
    } else {
      console.warn("未找到目标倍速菜单项");
    }
  }

  // 封装成函数，参数为 video 元素
  function forcePlaybackRate(videoDiv, targetRate = 2.0) {
    if (!videoDiv) {
      console.warn("未找到视频元素");
      return;
    }
    const video = videoDiv.querySelector("video"); // 获取容器内的视频元素

    console.log("当前视频为：", video);
    console.log("正在强制设置视频倍速:", video.playbackRate, "->", targetRate);
    // 1. 强制设置倍速
    video.playbackRate = targetRate;
    console.log("已强制设置视频倍速:", video.playbackRate);
    // 2. 防止被检测：重写 playbackRate 属性
    Object.defineProperty(video, "playbackRate", {
      get: function () {
        return targetRate;
      },
      set: function (val) {
        /* 忽略外部设置，始终保持 targetRate */
      },
      configurable: true,
    });

    // 3. 拦截 addEventListener，防止外部监听 playbackratechange
    var oldAddEventListener = video.addEventListener;
    video.addEventListener = function (type, listener, options) {
      if (type === "ratechange" || type === "playbackratechange") {
        // 不注册外部的 ratechange 监听
        return;
      }
      return oldAddEventListener.call(this, type, listener, options);
    };

    // 4. 定时修正，防止被脚本偷偷改回去
    var intervalId = setInterval(function () {
      if (video.playbackRate !== targetRate) {
        video.playbackRate = targetRate;
      }
    }, 1000);

    // 返回一个停止修正的函数
    return function stop() {
      clearInterval(intervalId);
    };
  }

  function waitForSubmitAndContinue(innerDoc) {
    return new Promise((resolve) => {
      const interval = setInterval(function () {
        const submitting = innerDoc.getElementById(
          VIDEO_QUESTION_SUBMITTING_ID,
        );
        if (submitting && submitting.style.display === "none") {
          clearInterval(interval);
          // 检查“继续学习”按钮
          const contBtn = innerDoc.getElementById(VIDEO_QUESTION_COMPLETE_ID);
          if (contBtn && contBtn.style.display === "block") {
            contBtn.click();
            const contInterval = setInterval(() => {
              if (contBtn.style.display !== "block") {
                clearInterval(contInterval);
                resolve(true);
              }
            }, 200);
          } else {
            resolve(false);
          }
        }
      }, 200);
    });
  }

  function autoQuestionDeal(target, innerDoc) {
    console.log("开始处理互动题目:", target);
    videoLock = true; // 锁定视频处理，防止多次点击
    try {
      if (target) {
        let pollCount = 0;
        const maxPoll = DEFAULT_TRY_COUNT;
        const poll = async () => {
          if (target.style.visibility === "") {
            console.log("visi has been changed:", target.style.visibility);
            const radios = innerDoc.querySelectorAll(
              VIDEO_QUESTION_RADIOS_FEATURE_CLASSES,
            );
            const checkboxes = innerDoc.querySelectorAll(
              VIDEO_QUESTION_CHECKBOXES_FEATURE_CLASSES,
            );

            if (checkboxes.length > 0) {
              // 多选
              const n = checkboxes.length;
              for (let mask = 1; mask < 1 << n; mask++) {
                checkboxes.forEach((cb) => (cb.checked = false));
                for (let j = 0; j < n; j++) {
                  if (mask & (1 << j)) {
                    checkboxes[j].click();
                  }
                }
                console.log("正在提交多选题目");
                innerDoc
                  .querySelector(VIDEO_QUESTION_SUBMIT_FEATURE_CLASS)
                  .click();
                const over = await waitForSubmitAndContinue(innerDoc);
                if (over) return;
              }
            } else if (radios.length > 0) {
              // 单选
              for (const radio of radios) {
                radio.click();
                console.log("正在提交单选题目");
                innerDoc
                  .querySelector(VIDEO_QUESTION_SUBMIT_FEATURE_CLASS)
                  .click();
                const over = await waitForSubmitAndContinue(innerDoc);
                if (over) return;
              }
            }
          } else if (pollCount < maxPoll) {
            pollCount++;
            setTimeout(poll, DEFAULT_SLEEP_TIME);
          }
        };
        poll();
      } else {
        console.error("没有找到目标元素");
      }
    } catch (e) {
      console.warn("autoQuestionDeal 执行异常:", e);
    }
    videoLock = false; // 解除视频处理锁
  }

  function findVideoElement(innerDoc) {
    const videoDiv = innerDoc.getElementById(VIDEO_IFRAME_ID); //视频主元素
    const target = innerDoc.getElementById(VIDEO_QUESTION_ID); // 互动答题元素

    const launchBtn = innerDoc.querySelector(VIDEO_LAUNCH_FEATURE_CLASS); // 视频启动按钮
    const playControlBtn = innerDoc.querySelector(VIDEO_PLAY_FEATURE_CLASS); // 视频播放按钮
    const paceList = innerDoc.querySelectorAll(VIDEO_PACELIST_FEATURE_CLASS); // 倍速播放列表
    const muteBtn = innerDoc.querySelector(VIDEO_MUTEBTN_FEATURE_CLASS); // 静音按钮

    if (!videoDiv) {
      console.log("[调试] 未找到 video 元素");
    } else {
      console.log("该章节为video,进行参数捕获", videoDiv);
      // 优化调试输出部分
      console.log("该章节为video,进行参数捕获", videoDiv);

      // 使用一个通用函数处理元素检测日志
      function logElementStatus(element, name, found = true) {
        console.log(
          `[调试] ${found ? "找到" : "未找到"}${name}:`,
          element || "",
        );
      }

      const elementsToLog = [
        { element: launchBtn, name: "播放按钮" },
        { element: playControlBtn, name: "播放控制按钮" },
        { element: target, name: "目标元素 ext-comp-1046" },
        { element: muteBtn, name: "静音按钮" },
        { element: paceList.length > 0, name: "菜单项" },
      ];

      for (const { element, name } of elementsToLog) {
        logElementStatus(element, name, !!element);
      }

      if (paceList.length > 0) {
        console.log("[调试] 菜单项:", paceList);
      }

      if (videoDiv) {
        return {
          innerDoc,
          videoDiv,
          launchBtn,
          target,
          playControlBtn,
          paceList,
          muteBtn,
        };
      }
    }
    return null;
  }

  function findAudioElement(innerDoc) {
    const audioDiv = innerDoc.getElementById(AUDIO_PLAYER_ID);
    if (!audioDiv) {
      console.log("[调试] 未找到 audio 元素");
      return null;
    }
    const audioEl = innerDoc.getElementById(AUDIO_ELEMENT_ID);
    const playControlBtn = innerDoc.querySelector(VIDEO_PLAY_FEATURE_CLASS);
    console.log("该章节为audio,进行参数捕获", audioDiv);
    return { audioDiv, audioEl, playControlBtn };
  }

  async function autoPlayAudio(audioDiv, audioEl, playControlBtn) {
    return new Promise(async (resolve) => {
      if (!audioDiv || !audioEl) {
        resolve(false);
        return;
      }
      if (audioDiv.classList.contains(VIDEO_ENDED_FEATURE_CLASS)) {
        resolve(true);
        return;
      }
      audioEl.addEventListener("ended", function handler() {
        audioEl.removeEventListener("ended", handler);
        resolve(true);
      });

      // 等待元数据加载（duration 可用）
      async function waitForDuration() {
        if (audioEl.readyState >= 1 && audioEl.duration > 0) return;
        await new Promise((r) => {
          if (audioEl.readyState >= 1) {
            r();
            return;
          }
          audioEl.addEventListener("loadedmetadata", r, { once: true });
        });
      }

      // 先尝试静音播放绕过自动播放策略，再跳到结尾
      audioEl.muted = true;
      try {
        await audioEl.play();
        await waitForDuration();
        if (audioEl.duration > 0 && !isNaN(audioEl.duration)) {
          audioEl.currentTime = audioEl.duration - 0.1;
        }
        return;
      } catch (e) {
        console.warn("音频静音自动播放失败，回退到点击播放按钮", e);
      }

      // 回退：点击播放按钮
      if (playControlBtn) playControlBtn.click();
      for (let i = 0; i < DEFAULT_TRY_COUNT; i++) {
        await timeSleep(DEFAULT_SLEEP_TIME);
        if (
          audioEl.duration > 0 &&
          !isNaN(audioEl.duration) &&
          !audioEl.paused
        ) {
          audioEl.currentTime = audioEl.duration - 0.1;
          return;
        }
      }
      console.warn("音频未能正常播放，超时");
      resolve(false);
    });
  }

  async function tryStartVideo(videoDiv, launchBtn, paceList, muteBtn) {
    let tryCount = 0;
    while (
      !videoDiv.classList.contains(VIDEO_HAS_LAUNCHED_FEATURE_CLASS) &&
      tryCount < 10
    ) {
      if (launchBtn) {
        launchBtn.click();
      } else {
        console.warn("未找到启动按钮,请用户手动点击");
        break;
      }
      tryCount++;
      await timeSleep(DEFAULT_SLEEP_TIME);
    }
    await timeSleep(DEFAULT_SLEEP_TIME);
    if (DEFAULT_SPEED_OPTION) {
      forcePlaybackRate(videoDiv, DEFAULT_SPEED);
    } else {
      selectMenuItem(paceList);
    }
    if (AUTO_MUTE) muteVideo(muteBtn);
  }

  function autoPlayVideo(
    innerDoc,
    videoDiv,
    launchBtn,
    target,
    playControlBtn,
    paceList,
    muteBtn,
  ) {
    return new Promise((resolve) => {
      if (!videoDiv) {
        console.error("请求超时,请检查网络或与作者联系");
        resolve(false);
        return;
      }
      let pauseFreeze = false;
      console.log("debug successfully");
      let observer = null;
      const checkClass = () => {
        if (videoDiv.classList.contains(VIDEO_ENDED_FEATURE_CLASS)) {
          console.log("class 已包含 vjs-ended");
          observer?.disconnect();
          resolve(true);
        } else if (
          !videoDiv.classList.contains(VIDEO_HAS_LAUNCHED_FEATURE_CLASS)
        ) {
          tryStartVideo(videoDiv, launchBtn, paceList, muteBtn);
          if (AUTO_ANSWER && target && target.style.visibility !== "hidden") {
            console.log("检测为互动题目,正在处理");
            autoQuestionDeal(target, innerDoc);
            pauseFreeze = true;
            setTimeout(() => {
              pauseFreeze = false; // 5秒后解除暂停冻结
            }, 10 * DEFAULT_SLEEP_TIME);
          }
        } else if (videoDiv.classList.contains(VIDEO_PAUSED_FEATURE_CLASS)) {
          console.log("课程被暂停,正在检测原因");
          timeSleep(DEFAULT_SLEEP_TIME).then(() => {
            if (videoDiv.classList.contains(VIDEO_PAUSED_FEATURE_CLASS)) {
              if (videoDiv.classList.contains(VIDEO_ENDED_FEATURE_CLASS)) {
                //由于视频结束时有暂停属性，由于延迟会产生分支跳跃到此处的情况，此步为防止一个视频循环播放
                return;
              }
              if (
                AUTO_ANSWER &&
                target &&
                target.style.visibility !== "hidden"
              ) {
                console.log("检测为互动题目,正在处理");
                autoQuestionDeal(target, innerDoc);
                pauseFreeze = true;
                setTimeout(() => {
                  pauseFreeze = false; // 5秒后解除暂停冻结
                }, 10 * DEFAULT_SLEEP_TIME);
              } else if (playControlBtn) {
                if (!pauseFreeze) {
                  console.log("未检测到互动题目,已自动点击播放按钮");
                  let tryCount = 0;
                  const maxTry = DEFAULT_TRY_COUNT - 10;
                  const tryPlay = () => {
                    if (
                      !videoDiv.classList.contains(
                        VIDEO_PAUSED_FEATURE_CLASS,
                      ) ||
                      tryCount >= maxTry ||
                      videoLock
                    ) {
                      if (tryCount >= maxTry) {
                        console.warn("多次尝试点击播放按钮未成功，请手动处理");
                      }
                      return;
                    }
                    if (!videoLock) {
                      playControlBtn.click();
                    }
                    tryCount++;
                    setTimeout(tryPlay, DEFAULT_SLEEP_TIME);
                  };
                  tryPlay();
                } else {
                  console.warn("暂停状态已冻结,请用户手动点击播放按钮");
                }
                //同时兼顾后台播放功能，因为学习通只会在你鼠标离开页面时触发一次暂停，此后无检测
              } else {
                console.warn("未找到播放控制按钮,请用户手动点击播放");
              }
            } else {
              console.log("暂停状态已自动恢复,无需处理");
            }
          });
        } else if (
          AUTO_ANSWER &&
          target &&
          target.style.visibility !== "hidden"
        ) {
          console.log("检测为互动题目,正在处理");
          autoQuestionDeal(target, innerDoc);
          pauseFreeze = true;
          setTimeout(() => {
            pauseFreeze = false; // 5秒后解除暂停冻结
          }, 10 * DEFAULT_SLEEP_TIME);
        } else {
          console.log("视频正在播放中，继续检测");
        }
      };
      observer = new MutationObserver(checkClass);
      observer.observe(videoDiv, {
        attributes: true,
        attributeFilter: ["class"],
      });
      checkClass();
    });
  }

  function findPdfElement(innerDoc) {
    const finalIframe = innerDoc.getElementById(PDF_IFRAME_ID);
    if (!finalIframe) {
      console.log("[调试] 未找到 panView 元素");
      return null;
    }
    let finalDoc;
    try {
      finalDoc =
        finalIframe.contentDocument || finalIframe.contentWindow.document;
    } catch (e) {
      console.log("[调试] 获取 panView 的 document 失败", e);
      return null;
    }

    const pdfHtml = finalDoc.documentElement;
    if (!pdfHtml) {
      console.log("[调试] 未找到 pdf 元素");
      return null;
    }

    const pdfBody = finalDoc.body;
    if (!pdfBody || !pdfBody.childNodes || pdfBody.childNodes.length === 0) {
      console.log("[调试] PDF 文档 body 为空或不存在");
      return null;
    }
    console.log("已找到 pdf 元素:", pdfHtml);
    return { pdfHtml };
  }

  function scrollPdfToBottom(
    pdfHtml,
    maxTries = Math.floor(DEFAULT_TRY_COUNT / 10),
  ) {
    return new Promise(async (resolve) => {
      let lastTop = pdfHtml.scrollTop;
      let tries = 0;
      while (tries < maxTries) {
        pdfHtml.scrollTo({
          top: pdfHtml.scrollHeight,
          behavior: "smooth",
        });
        await timeSleep(4 * DEFAULT_SLEEP_TIME); // 等待滚动动画
        if (pdfHtml.scrollTop !== lastTop && pdfHtml.scrollTop > 0) {
          resolve(true); // 滚动成功
          return;
        }
        lastTop = pdfHtml.scrollTop;
        tries++;
      }
      resolve(false); // 多次尝试后仍未滚动
    });
  }

  function findWorkElement(innerDoc) {
    const testIframe = innerDoc.getElementById("frame_content");
    if (!testIframe) {
      console.log("[调试] 未找到 frame_content 元素");
      return null;
    }
    let testDoc;
    try {
      testDoc = testIframe.contentDocument || testIframe.contentWindow.document;
    } catch (e) {
      console.log("[调试] 获取 frame_content 的 document 失败", e);
      return null;
    }

    const testList = testDoc.querySelectorAll(".singleQuesId");
    if (testList.length === 0) {
      console.log("[调试] 未找到任何测试题目");
      return null;
    }
    console.log("已找到测试题目:", testList);

    const submitBtn = testDoc.querySelector(".btnSubmit");
    if (!submitBtn) {
      console.log("[调试] 未找到提交按钮");
      return null;
    }
    return { testDoc, testList, submitBtn };
  }

  function autoFillAnswers(testList, answerJson) {
    answerJson.forEach((item) => {
      const qNum = item["题号"];
      const ans = item["答案"];
      for (const quesDiv of testList) {
        const iTag = quesDiv.querySelector("i");
        if (iTag && iTag.textContent.trim() === qNum) {
          // 判断题型
          const titleSpan = quesDiv.querySelector(".newZy_TItle");
          let type = "";
          if (titleSpan) {
            const text = titleSpan.textContent.toLowerCase();
            if (text.includes("多选") || text.includes("mul")) type = "multi";
            else if (text.includes("判断") || text.includes("tru"))
              type = "judge";
            else if (text.includes("单选") || text.includes("sin"))
              type = "single";
          }
          // 多选题
          if (type === "multi") {
            // 先清除之前选中的多选项
            const checkedSpans = quesDiv.querySelectorAll(
              "span.check_answer_dx",
            );
            checkedSpans.forEach((span) => span.click());

            let ansArr = [];
            if (typeof ans === "string") {
              if (ans.includes(",")) {
                ansArr = ans.split(",").map((s) => s.trim());
              } else {
                ansArr = ans.split("").map((s) => s.trim());
              }
            } else if (Array.isArray(ans)) {
              ansArr = ans;
            }
            for (const ch of ansArr) {
              const optSpan = quesDiv.querySelector(
                `span.num_option_dx[data="${ch}"]`,
              );
              if (optSpan) optSpan.click();
              else console.warn(`题号${qNum}未找到选项${ch}`);
            }
          } else if (type === "judge") {
            // 先清除之前选中的判断项
            const checkedSpans = quesDiv.querySelectorAll("span.check_answer");
            checkedSpans.forEach((span) => span.click());

            let val = ans;
            if (
              val[0] === "A" ||
              val[0] === "对" ||
              val[0] === "t" ||
              val[0] === "T" ||
              val === true
            )
              val = "true";
            else if (
              val[0] === "B" ||
              val[0] === "错" ||
              val[0] === "f" ||
              val[0] === "F" ||
              val === false
            )
              val = "false";
            const optSpan = quesDiv.querySelector(
              `span.num_option[data="${val}"]`,
            );
            if (optSpan) optSpan.click();
            else console.warn(`题号${qNum}未找到判断选项${val}`);
          } else {
            // 单选题，先清除之前选中的
            const checkedSpans = quesDiv.querySelectorAll("span.check_answer");
            checkedSpans.forEach((span) => span.click());

            for (const ch of ans) {
              const optSpan = quesDiv.querySelector(
                `span.num_option[data="${ch}"]`,
              );
              if (optSpan) optSpan.click();
              else console.warn(`题号${qNum}未找到选项${ch}`);
            }
          }
          break;
        }
      }
    });
  }

  function answerFixes(testList, answerHistory) {
    console.log("开始修补答案");
    const answerJson = [];
    testList.forEach((quesDiv) => {
      const iTag = quesDiv.querySelector("i");
      const qNum = iTag ? iTag.textContent.trim() : "";
      const qIndex = Number(qNum); // 变成数字类型
      if (!answerTable[qIndex]) {
        answerTable[qIndex] = [];
      }
      const titleSpan = quesDiv.querySelector(".newZy_TItle");
      let type = "";
      if (titleSpan) {
        if (titleSpan.textContent.includes("多选")) type = "multi";
        else if (titleSpan.textContent.includes("判断")) type = "judge";
        else if (titleSpan.textContent.includes("单选")) type = "single";
      }

      if (type === "multi") {
        // 多选题
        const options = quesDiv.querySelectorAll("span.num_option_dx");
        console.log("多选题修补之初的table:", answerTable);
        if (answerTable[qIndex].length === 0) {
          console.log("进入初始化");
          answerTable[qIndex] = Array(options.length).fill(-1);
        }

        if (answerHistory[qIndex]?.some((record) => record.mark === "right")) {
          answerJson.push({
            题号: qNum,
            答案: answerHistory[qIndex][0]?.answer || "",
          });
          return;
        } else if (
          answerHistory[qIndex]?.some((record) => record.mark === "half")
        ) {
          // 存在半对的答案
          const ansArr = answerHistory[qIndex]
            .map((record) => record.answer.trim())
            .flatMap((str) =>
              str.includes(",")
                ? str.split(",").map((s) => s.trim())
                : str.split(""),
            );
          ansArr.forEach((ch) => {
            answerTable[qIndex][ch.charCodeAt(0) - "A".charCodeAt(0)] = 1;
          });
        } else {
          console.log("before修补的answerTable:", answerTable);
          const ansArr = answerHistory[qIndex]
            .map((record) => record.answer.trim())
            .flatMap((str) =>
              str.includes(",")
                ? str.split(",").map((s) => s.trim())
                : str.split(""),
            );
          console.log("ansArr:", ansArr);
          const filteredArr = ansArr.filter(
            (ch) =>
              answerTable[qIndex][ch.charCodeAt(0) - "A".charCodeAt(0)] !== 1,
          );
          console.log("filteredArr:", filteredArr);
          if (filteredArr.length === 1) {
            answerTable[qIndex][
              filteredArr[0].charCodeAt(0) - "A".charCodeAt(0)
            ] = 0;
          }
          console.log("answerTable:", answerTable);
          //confirm('debug: 可能存在多选题答案修补问题，请检查控制台输出');
        }
        let tryAnother = true;
        let ansStr = "";
        for (let i = 0; i < options.length; i++) {
          if (answerTable[qIndex][i] === -1) {
            if (tryAnother) {
              ansStr += options[i].getAttribute("data");
              tryAnother = false;
            }
          } else if (answerTable[qIndex][i] === 1) {
            ansStr += options[i].getAttribute("data");
          }
        }
        if (ansStr.length > 0) {
          answerJson.push({
            题号: qNum,
            答案: ansStr,
          });
        } else {
          xxtNotify(`题号 ${qNum} 未找到任何有效答案`, 2);
        }
      } else if (type === "judge") {
        // 判断题
        const options = quesDiv.querySelectorAll("span.num_option_dx");
        if (answerTable[qIndex].length === 0) {
          answerTable[qIndex] = Array(options.length).fill(-1);
        }

        if (answerHistory[qIndex]?.some((record) => record.mark === "right")) {
          answerJson.push({
            题号: qNum,
            答案: answerHistory[qIndex][0]?.answer || "",
          });
          return;
        } else {
          let ansStr = answerHistory[qIndex][0]?.answer;
          ansStr =
            ansStr[0] === "对" || ansStr[0] === "A" || ansStr === "true"
              ? "false"
              : "true";
          if (ansStr) {
            answerJson.push({
              题号: qNum,
              答案: ansStr,
            });
          } else {
            xxtNotify(`题号 ${qNum} 未找到任何有效答案`, 2);
          }
        }
      } else {
        // 单选题
        const options = quesDiv.querySelectorAll("span.num_option_dx");
        if (answerTable[qIndex].length === 0) {
          answerTable[qIndex] = Array(options.length).fill(-1);
        }

        if (answerHistory[qIndex]?.some((record) => record.mark === "right")) {
          answerJson.push({
            题号: qNum,
            答案: answerHistory[qIndex][0]?.answer || "",
          });
          return;
        } else {
          let ansStr = answerHistory[qIndex][0]?.answer;
          const copy = ansStr;
          answerTable[qIndex][ansStr[0].charCodeAt(0) - "A".charCodeAt(0)] = 0;
          while (
            answerTable[qIndex][ansStr[0].charCodeAt(0) - "A".charCodeAt(0)] ===
            0
          ) {
            ansStr = String.fromCharCode(
              ((ansStr[0].charCodeAt(0) - "A".charCodeAt(0) + 1) % 4) +
                "A".charCodeAt(0),
            );
          }
          if (ansStr && ansStr !== "\u0000") {
            answerJson.push({
              题号: qNum,
              答案: ansStr,
            });
          } else {
            console.log("copy:", copy);
            console.log("ansStr:", ansStr);
            xxtNotify(`题号 ${qNum} 未找到任何有效答案`, 2);
          }
        }
      }
    });
    console.log("修补答案完成:", answerJson);
    return answerJson;
  }

  async function handleIframeChange(prama) {
    if (allTaskDown) return;

    if (handleIframeLock) {
      console.log("handleIframeChange 已加锁，跳过本次调用");
      return;
    }
    handleIframeLock = true;

    // 唯一性控制，防止异步出bug（事实上确实会出很多bug）
    let firstLayerCancel = null;
    let secondLayerCancel = null;
    let thirdLayerCancel = null;
    let FourthLayerCancel = null;

    let learningFix = false;

    (function firstLayer() {
      //抓取三层iframe
      if (firstLayerCancel) firstLayerCancel();
      firstLayerCancel = waitForElement(
        () => {
          if (allTaskDown) return;
          console.log("第一层回调执行");
          let outerDoc = findOuterDoc();
          const learning2 = document.getElementById("dct2");
          const learning3 = document.getElementById("dct3");
          if (learning3 && prama === 3 && !learningFix) {
            console.log("检测到特殊页面结构，即将跳转");
            learning2.click();
            learningFix = true;
            return null;
          }
          return outerDoc;
        },
        (outerDoc) => {
          // 第二层
          (function secondLayer() {
            if (secondLayerCancel) secondLayerCancel();
            secondLayerCancel = waitForElement(
              () => {
                if (allTaskDown) return;
                console.log("第二层回调执行");
                let innerDoc = findInnerDocs(outerDoc);
                return innerDoc;
              },
              (InnerDocs = []) => {
                (async function thirdLayer() {
                  if (!Array.isArray(InnerDocs) || InnerDocs.length === 0) {
                    console.warn("内层Docs为空，尝试跳过");
                    console.log("开始检测特殊页面结构");
                    console.log("检查是否有学习测验");
                    await timeSleep(10 * DEFAULT_SLEEP_TIME);
                    let learningTest = document.getElementById("dct2");
                    const learningTestFix = document.getElementById("dct3");
                    if (learningTestFix) {
                      learningTest = learningTestFix;
                    }
                    if (
                      learningTest &&
                      (prama === 1 || prama === 3) &&
                      !hasEnterdct2
                    ) {
                      const unfinished = document.querySelector(
                        '.ans-job-icon[aria-label="任务点未完成"]',
                      );
                      if (unfinished) {
                        // 存在未完成任务点
                        console.log("有未完成的任务点");
                      } else {
                        // 没有未完成任务点
                        console.log("所有任务点已完成");
                        learningTest.click();
                        hasEnterdct2 = true;
                        await timeSleep(DEFAULT_SLEEP_TIME);
                        handleIframeLock = false; //
                        await handleIframeChange(1);
                      }
                      return;
                    } else {
                      console.log("此章节学习测验已处理");
                      if (prama !== 2) answerTable = [];
                      console.log("已处理完所有章节任务，准备跳转到下一章节");
                      await timeSleep(25 * DEFAULT_SLEEP_TIME);
                      const unfinished = document.querySelector(
                        '.ans-job-icon[aria-label="任务点未完成"]',
                      );
                      if (unfinished) {
                        // 存在未完成任务点
                        console.log("有未完成的任务点");
                      } else {
                        // 没有未完成任务点
                        console.log("所有任务点已完成");
                        hasEnterdct2 = false;
                        continueToNextChapter();
                      }
                    }
                    return;
                  }
                  // 第三层
                  console.log("第三层回调执行");
                  console.log("找到的内层文档数目:", InnerDocs.length);
                  const needSkip = outerDoc.querySelectorAll(".ans-job-icon");
                  let taskCount = 0;
                  async function runTasksSerially() {
                    for (const { innerDoc, Type } of InnerDocs) {
                      // for...of 防错乱
                      console.log(`处理 ${Type} 任务点...`);
                      try {
                        if (taskCount >= needSkip.length) {
                          console.log("已处理完所有任务点，准备跳转到下一章节");
                          if (Type === "Work") prama = 0;
                        } else if (
                          needSkip[taskCount].getAttribute("aria-label") ===
                          "任务点已完成"
                        ) {
                          console.log("任务点已完成，跳过");
                          if (Type === "Work") prama = 0;
                        } else if (Type === "Video") {
                          console.log("该章节为VIDEO,进行参数捕获");
                          await new Promise((resolve) => {
                            if (FourthLayerCancel) FourthLayerCancel();
                            FourthLayerCancel = waitForElement(
                              () => {
                                if (allTaskDown) return;
                                console.log("第四层回调执行");
                                return findVideoElement(innerDoc);
                              },
                              async (innerParam) => {
                                if (!innerParam) {
                                  console.warn("页面异常加载，尝试跳过");
                                  resolve();
                                  return;
                                }
                                const {
                                  videoDiv,
                                  launchBtn,
                                  target,
                                  playControlBtn,
                                  paceList,
                                  muteBtn,
                                } = innerParam;
                                await autoPlayVideo(
                                  innerDoc,
                                  videoDiv,
                                  launchBtn,
                                  target,
                                  playControlBtn,
                                  paceList,
                                  muteBtn,
                                );
                                resolve();
                              },
                            );
                          });
                        } else if (Type === "Pdf") {
                          console.log("该章节为PDF,进行参数捕获");
                          await new Promise((resolve) => {
                            if (thirdLayerCancel) thirdLayerCancel();
                            thirdLayerCancel = waitForElement(
                              () => {
                                return findPdfElement(innerDoc);
                              },
                              async ({ pdfHtml } = {}) => {
                                if (!pdfHtml) {
                                  console.error(
                                    "请求超时, 请检查网络或与作者联系",
                                  );
                                  resolve();
                                  return;
                                }
                                let toBottom = false;
                                if (AUTO_PDF) {
                                  toBottom = await scrollPdfToBottom(pdfHtml);
                                }
                                if (toBottom) {
                                  console.log("PDF滚动成功！");
                                } else if (AUTO_PDF) {
                                  console.warn(
                                    "PDF多次滚动无效，可能页面未加载完全",
                                  );
                                } else {
                                  console.log("自动翻页PDF已关闭，跳过滚动");
                                }
                                await timeSleep(2 * DEFAULT_SLEEP_TIME);
                                console.log("章节处理完毕");
                                resolve();
                              },
                            );
                          });
                        } else if (Type === "Audio") {
                          console.log("该章节为AUDIO,进行参数捕获");
                          if (!AUTO_AUDIO) {
                            console.log("自动播放音频已关闭，跳过");
                          } else {
                            await new Promise((resolve) => {
                              if (thirdLayerCancel) thirdLayerCancel();
                              thirdLayerCancel = waitForElement(
                                () => findAudioElement(innerDoc),
                                async (innerParam) => {
                                  if (!innerParam) {
                                    console.warn("页面异常加载，尝试跳过");
                                    resolve();
                                    return;
                                  }
                                  const { audioDiv, audioEl, playControlBtn } =
                                    innerParam;
                                  await autoPlayAudio(
                                    audioDiv,
                                    audioEl,
                                    playControlBtn,
                                  );
                                  await timeSleep(DEFAULT_SLEEP_TIME);
                                  resolve();
                                },
                              );
                            });
                          }
                        } else if (Type === "Work") {
                          console.log("该章节为WORK,进行参数捕获");
                          await new Promise((resolve) => {
                            if (thirdLayerCancel) thirdLayerCancel();
                            thirdLayerCancel = waitForElement(
                              () => {
                                return findWorkElement(innerDoc);
                              },
                              async ({ testDoc, testList, submitBtn } = {}) => {
                                if (!testList || testList.length === 0) {
                                  console.error(
                                    "请求超时, 请检查网络或与作者联系",
                                  );
                                  resolve();
                                  return;
                                }
                                console.log("已找到测试题目:", testList);
                                if (prama === 2) {
                                  console.warn("检测为不及格，开始修补模式");
                                  const answerBasicList =
                                    testDoc.querySelectorAll(".newAnswerBx");
                                  if (answerBasicList.length === 0) {
                                    console.warn(
                                      "未找到答案列表，可能是页面加载异常",
                                    );
                                    resolve();
                                    return;
                                  }
                                  let index = 0;
                                  let answerHistory = [];
                                  for (const answerBasic of answerBasicList) {
                                    index++;
                                    if (!answerHistory[index]) {
                                      answerHistory[index] = [];
                                    }
                                    const answerCon =
                                      answerBasic.querySelector(".answerCon");
                                    let answerMark;
                                    const wrong =
                                      answerBasic.querySelector(".marking_cuo");
                                    const half =
                                      answerBasic.querySelector(
                                        ".marking_bandui",
                                      );
                                    if (wrong) {
                                      answerMark = "wrong";
                                    } else if (half) {
                                      answerMark = "half";
                                    } else {
                                      answerMark = "right";
                                    }
                                    answerHistory[index].push({
                                      answer: answerCon.textContent.trim(),
                                      mark: answerMark,
                                    });
                                  }
                                  console.log(
                                    "已获取到答案历史:",
                                    answerHistory,
                                  );
                                  //confirm('[调试],已获取到答案历史，准备修补');
                                  let answerJson = answerFixes(
                                    testList,
                                    answerHistory,
                                  );
                                  if (answerJson.length === 0) {
                                    xxtNotify("答案修补失败，请手动处理", 2);
                                    resolve();
                                    return;
                                  } else {
                                    autoFillAnswers(testList, answerJson);
                                    console.log("已自动填充答案");
                                    resolve();
                                  }
                                  //confirm('已修补答案，准备提交');
                                  submitBtn.click();
                                  await timeSleep(DEFAULT_SLEEP_TIME);
                                  const configElement =
                                    document.getElementById("workpop");
                                  const configBtn =
                                    document.getElementById("popok");
                                  if (
                                    configElement &&
                                    window.getComputedStyle(configElement)
                                      .display !== "none"
                                  ) {
                                    if (configBtn) {
                                      configBtn.click();
                                      console.log("已自动点击确定按钮");
                                    } else {
                                      console.warn("未找到确定按钮");
                                    }
                                  }
                                  await timeSleep(2 * DEFAULT_SLEEP_TIME);
                                  //confirm ('已提交测试题目，等待结果');
                                  const configContent =
                                    document.getElementById("popcontent");
                                  if (
                                    configContent &&
                                    configContent.textContent.includes(
                                      "未达到及格线",
                                    )
                                  ) {
                                    console.warn("检测到未及格，需重做！");
                                    configBtn.click();
                                    await timeSleep(DEFAULT_SLEEP_TIME);
                                    handleIframeLock = false; //
                                    await handleIframeChange(2);
                                    return;
                                  } else {
                                    console.log("已成功提交测试题目");
                                    answerTable = [];
                                    console.log(
                                      "已处理完所有章节任务，准备跳转到下一章节",
                                    );
                                    await timeSleep(25 * DEFAULT_SLEEP_TIME);
                                    const unfinished = document.querySelector(
                                      '.ans-job-icon[aria-label="任务点未完成"]',
                                    );
                                    if (unfinished) {
                                      // 存在未完成任务点
                                      console.log("有未完成的任务点");
                                    } else {
                                      // 没有未完成任务点
                                      console.log("所有任务点已完成");
                                      hasEnterdct2 = false;
                                      continueToNextChapter();
                                    }
                                  }
                                } else {
                                  console.warn("课后测验题目需手动完成");
                                }
                              },
                            );
                          });
                        }
                      } finally {
                        console.log(
                          `任务点 ${taskCount + 1} / ${needSkip.length} 已处理`,
                        );
                        taskCount++;
                      }
                    }
                    // 所有任务完成后
                    console.log("所有章节任务已完成，准备跳转到下一章节");
                    console.log("检查是否有学习测验");
                    await timeSleep(10 * DEFAULT_SLEEP_TIME);
                    let learningTest = document.getElementById("dct2");
                    const learningTestFix = document.getElementById("dct3");
                    if (learningTestFix) {
                      learningTest = learningTestFix;
                    }
                    if (
                      learningTest &&
                      (prama === 1 || prama === 3) &&
                      !hasEnterdct2
                    ) {
                      const unfinished = document.querySelector(
                        '.ans-job-icon[aria-label="任务点未完成"]',
                      );
                      if (unfinished) {
                        // 存在未完成任务点
                        console.warn("有未完成的任务点,尝试跳过");
                      } else {
                        // 没有未完成任务点
                        console.log("所有任务点已完成");
                      }
                      learningTest.click();
                      hasEnterdct2 = true;
                      await timeSleep(DEFAULT_SLEEP_TIME);
                      handleIframeLock = false; //
                      await handleIframeChange(1);
                    } else {
                      console.log("此章节学习测验已处理");
                      if (prama !== 2) answerTable = [];
                      console.log("已处理完所有章节任务，准备跳转到下一章节");
                      await timeSleep(25 * DEFAULT_SLEEP_TIME);
                      const unfinished = outerDoc.querySelector(
                        '.ans-job-icon[aria-label="任务点未完成"]',
                      );
                      if (unfinished) {
                        // 存在未完成任务点
                        console.log("有未完成的任务点");
                      } else {
                        // 没有未完成任务点
                        console.log("所有任务点已完成");
                      }
                      hasEnterdct2 = false;
                      continueToNextChapter();
                    }
                  }

                  // 调用
                  runTasksSerially();
                })();
              },
            );
          })();
        },
      );
    })();
  }

  // ========== Layui UI 面板 ==========

  let _settingDialogOpen = false;

  function injectLayuiCSS() {
    if (!document.querySelector('link[href*="layui"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://cdn.jsdelivr.net/npm/layui@2.13.4/dist/css/layui.css";
      document.head.appendChild(link);
    }
    const style = document.createElement("style");
    style.textContent = `
        #xxt-panel{position:fixed;top:20px;right:20px;width:264px;background:#fff;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);z-index:9999;font-family:"微软雅黑",sans-serif;font-size:13px;user-select:none;transition:box-shadow .2s}
        #xxt-panel:hover{box-shadow:0 8px 32px rgba(0,0,0,.22)}
        #xxt-panel .xxt-hd{background:linear-gradient(135deg,#00897b,#26a69a);color:#fff;padding:10px 14px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:move}
        #xxt-panel .xxt-hd-title{font-size:14px;font-weight:700;letter-spacing:.3px}
        #xxt-panel .xxt-hd-btn{cursor:pointer;font-size:16px;line-height:1;opacity:.85;padding:2px 4px;border-radius:3px;transition:background .2s}
        #xxt-panel .xxt-hd-btn:hover{opacity:1;background:rgba(255,255,255,.25)}
        #xxt-panel .xxt-bd{padding:12px 14px 8px}
        #xxt-panel .xxt-row{display:flex;align-items:flex-start;margin-bottom:8px;line-height:1.6}
        #xxt-panel .xxt-lbl{color:#999;min-width:62px;flex-shrink:0;font-size:12px;padding-top:2px}
        #xxt-panel .xxt-val{color:#333;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:175px}
        #xxt-panel .xxt-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle;flex-shrink:0;background:#bbb;transition:background .3s}
        #xxt-panel .xxt-dot.run{background:#4caf50;animation:xxt-blink 1.5s infinite}
        #xxt-panel .xxt-dot.wait{background:#ff9800}
        #xxt-panel .xxt-dot.done{background:#2196f3}
        #xxt-panel .xxt-dot.err{background:#f44336}
        #xxt-panel .xxt-divider{height:1px;background:#f0f0f0;margin:4px 0 10px}
        #xxt-panel .xxt-ft{padding:8px 14px 12px;display:flex;gap:8px}
        #xxt-panel .xxt-ft .layui-btn{flex:1;font-size:12px;margin:0}
        #xxt-panel.xxt-mini .xxt-bd,#xxt-panel.xxt-mini .xxt-ft{display:none}
        .xxt-layer .layui-layer-title{background:#00897b;color:#fff;border:none}
        .xxt-layer .layui-layer-close{color:#fff !important;opacity:.85}
        .xxt-layer .layui-layer-close:hover{opacity:1}
        .xxt-layer .layui-layer-btn0{background:#00897b !important;border-color:#00897b !important}
        .xxt-layer .layui-layer-btn0:hover{background:#00796b !important;border-color:#00796b !important}
        #xxt-panel.xxt-mini{border-radius:10px;width:auto}
        #xxt-panel.xxt-mini .xxt-hd{border-radius:10px}
        @keyframes xxt-blink{0%,100%{opacity:1}50%{opacity:.25}}
        .xxt-switch{position:relative;display:inline-block;width:32px;height:18px;vertical-align:middle}
        .xxt-switch input{opacity:0;width:0;height:0;position:absolute}
        .xxt-switch-slider{position:absolute;inset:0;background:#ccc;border-radius:18px;cursor:pointer;transition:background .2s}
        .xxt-switch-slider::before{content:'';position:absolute;width:12px;height:12px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s}
        .xxt-switch input:checked+.xxt-switch-slider{background:#00897b}
        .xxt-switch input:checked+.xxt-switch-slider::before{transform:translateX(14px)}
        #xxt-panel .xxt-spd-link{color:#333;font-size:12px;font-weight:500;text-decoration:none;display:inline-flex;align-items:center;gap:3px}
        #xxt-panel .xxt-spd-link:hover{color:#00897b}
        #xxt-panel .xxt-spd-link i{font-size:10px}
        #xxt-panel .xxt-notes{background:#fffbf0;border:1px solid #ffe5a0;border-radius:6px;padding:8px 10px;margin-bottom:10px}
        #xxt-panel .xxt-notes ul{margin:0;padding-left:14px}
        #xxt-panel .xxt-notes li{font-size:11px;color:#7a6b3a;line-height:1.7;list-style:disc}
        #xxt-panel .xxt-cfgs{border:1px solid #f0f0f0;border-radius:6px;overflow:hidden;margin-bottom:4px}
        #xxt-panel .xxt-cfg-item{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#fff}
        #xxt-panel .xxt-cfg-item+.xxt-cfg-item{border-top:1px solid #f5f5f5}
        #xxt-panel .xxt-cfg-lbl{font-size:12px;color:#444;font-weight:500;line-height:1.4}
        #xxt-panel .xxt-cfg-desc{font-size:11px;color:#bbb;margin-top:1px}
        #xxt-panel .xxt-cfg-ctrl{flex-shrink:0;margin-left:8px}
    `;
    document.head.appendChild(style);
  }

  function createStatusPanel() {
    injectLayuiCSS();
    const el = document.createElement("div");
    el.id = "xxt-panel";
    el.innerHTML = `
        <div class="xxt-hd" id="xxt-drag">
            <span class="xxt-hd-title">📚 刷课助手</span>
            <span class="xxt-hd-btn" id="xxt-toggle" title="折叠 / 展开"><i class="layui-icon layui-icon-up"></i></span>
        </div>
        <div class="xxt-bd">
            <div class="xxt-row" style="align-items:center">
                <span class="xxt-lbl">播放倍速</span>
                <span class="xxt-val">
                    <a href="javascript:;" id="xxt-speed-dropdown" class="xxt-spd-link">
                        <span id="xxt-speed-text">${DEFAULT_SPEED}x</span>
                        <i class="layui-icon layui-icon-down layui-font-12"></i>
                    </a>
                </span>
            </div>
            <div class="xxt-row" style="align-items:center">
                <span class="xxt-lbl">强制倍速</span>
                <span class="xxt-val">
                    <label class="xxt-switch">
                        <input type="checkbox" id="xxt-force-switch" ${DEFAULT_SPEED_OPTION ? "checked" : ""}>
                        <span class="xxt-switch-slider"></span>
                    </label>
                </span>
            </div>
            <div class="xxt-row" style="align-items:center">
                <span class="xxt-lbl">自动静音</span>
                <span class="xxt-val">
                    <label class="xxt-switch">
                        <input type="checkbox" id="xxt-mute-switch" ${AUTO_MUTE ? "checked" : ""}>
                        <span class="xxt-switch-slider"></span>
                    </label>
                </span>
            </div>
            <div class="xxt-row" style="align-items:center">
                <span class="xxt-lbl">互动答题</span>
                <span class="xxt-val">
                    <label class="xxt-switch">
                        <input type="checkbox" id="xxt-answer-switch" ${AUTO_ANSWER ? "checked" : ""}>
                        <span class="xxt-switch-slider"></span>
                    </label>
                </span>
            </div>
            <div class="xxt-row" style="align-items:center">
                <span class="xxt-lbl">PDF翻页</span>
                <span class="xxt-val">
                    <label class="xxt-switch">
                        <input type="checkbox" id="xxt-pdf-switch" ${AUTO_PDF ? "checked" : ""}>
                        <span class="xxt-switch-slider"></span>
                    </label>
                </span>
            </div>
            <div class="xxt-row" style="align-items:center">
                <span class="xxt-lbl">音频播放</span>
                <span class="xxt-val">
                    <label class="xxt-switch">
                        <input type="checkbox" id="xxt-audio-switch" ${AUTO_AUDIO ? "checked" : ""}>
                        <span class="xxt-switch-slider"></span>
                    </label>
                </span>
            </div>
        </div>
        <div class="xxt-ft">
            <button class="layui-btn layui-btn-sm layui-btn-normal" id="xxt-about-btn">ℹ 关于</button>
            <button class="layui-btn layui-btn-sm layui-btn-warm" id="xxt-reset-btn">重置授权</button>
        </div>
    `;
    document.body.appendChild(el);
    // 拖拽
    let sx, sy, ox, oy;
    el.querySelector("#xxt-drag").addEventListener("mousedown", function (e) {
      sx = e.clientX;
      sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
      el.style.right = "auto";
      el.style.left = ox + "px";
      el.style.top = oy + "px";
      const mv = (e2) => {
        el.style.left = ox + e2.clientX - sx + "px";
        el.style.top = oy + e2.clientY - sy + "px";
      };
      const up = () => {
        document.removeEventListener("mousemove", mv);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", mv);
      document.addEventListener("mouseup", up);
      e.preventDefault();
    });

    // 折叠/展开
    el.querySelector("#xxt-toggle").addEventListener("click", function () {
      el.classList.toggle("xxt-mini");
      this.querySelector("i").className = el.classList.contains("xxt-mini")
        ? "layui-icon layui-icon-down"
        : "layui-icon layui-icon-up";
    });

    layui.use("dropdown", function () {
      layui.dropdown.render({
        elem: "#xxt-speed-dropdown",
        data: [1, 1.25, 1.5, 2, 3].map((s) => ({ title: s + "x", id: s })),
        style: "z-index: 10000;",
        click: function (obj) {
          GM_setValue("SPEED", parseFloat(obj.id));
          document.getElementById("xxt-speed-text").textContent = obj.title;
          xxtNotify("倍速已设为 " + obj.title + "，刷新页面生效", 6);
        },
      });
    });

    el.querySelector("#xxt-reset-btn").addEventListener("click", function () {
      layui.use("layer", function () {
        layui.layer.confirm(
          "确定重置启动授权？\n下次打开页面将重新显示确认框。",
          {
            title: "重置授权",
            btn: ["确定", "取消"],
            skin: "xxt-layer",
          },
          function (idx) {
            GM_setValue("XXT_CONFIRMED", false);
            layui.layer.close(idx);
            xxtNotify("授权已重置", 1);
          },
        );
      });
    });

    el.querySelector("#xxt-force-switch").addEventListener(
      "change",
      function () {
        GM_setValue("FORCE_SPEED", this.checked);
        xxtNotify(
          "强制倍速已" + (this.checked ? "开启" : "关闭") + "，刷新页面生效",
          6,
        );
      },
    );

    el.querySelector("#xxt-mute-switch").addEventListener(
      "change",
      function () {
        AUTO_MUTE = this.checked;
        GM_setValue("AUTO_MUTE", AUTO_MUTE);
        xxtNotify("自动静音已" + (AUTO_MUTE ? "开启" : "关闭"), 1);
      },
    );

    el.querySelector("#xxt-answer-switch").addEventListener(
      "change",
      function () {
        AUTO_ANSWER = this.checked;
        GM_setValue("AUTO_ANSWER", AUTO_ANSWER);
        xxtNotify("自动答题已" + (AUTO_ANSWER ? "开启" : "关闭"), 1);
      },
    );

    el.querySelector("#xxt-pdf-switch").addEventListener("change", function () {
      AUTO_PDF = this.checked;
      GM_setValue("AUTO_PDF", AUTO_PDF);
      xxtNotify("自动翻页PDF已" + (AUTO_PDF ? "开启" : "关闭"), 1);
    });

    el.querySelector("#xxt-audio-switch").addEventListener(
      "change",
      function () {
        AUTO_AUDIO = this.checked;
        GM_setValue("AUTO_AUDIO", AUTO_AUDIO);
        xxtNotify("自动播放音频已" + (AUTO_AUDIO ? "开启" : "关闭"), 1);
      },
    );

    el.querySelector("#xxt-about-btn").addEventListener("click", function () {
      layui.use("layer", function () {
        layui.layer.open({
          type: 1,
          title: "关于",
          btn: false,
          closeBtn: 1,
          area: "380px",
          skin: "xxt-layer",
          content:
            '<div style="text-align:center;padding:16px 0">' +
            '<div style="font-size:16px;font-weight:700;margin-bottom:10px">学习通一键全自动刷课助手</div>' +
            '<div style="color:#666;line-height:2">版本:1.0<br>' +
            '<a href="https://github.com/Memory2314/XuexitongJSFork" target="_blank" style="color:#00897b;font-size:12px">在 GitHub 查看源码</a><br>' +
            "</div></div>",
        });
      });
    });
  }

  function xxtNotify(msg, icon) {
    if (typeof layui !== "undefined") {
      layui.use("layer", function () {
        layui.layer.msg(msg, { icon: icon || 6, time: 3000 });
      });
    }
  }

  function xxtDialog(msg, title) {
    if (typeof layui !== "undefined") {
      layui.use("layer", function () {
        layui.layer.alert(msg, {
          title: title || "提示",
          btn: ["确定"],
          area: "380px",
          skin: "xxt-layer",
        });
      });
    } else {
      alert(msg);
    }
  }

  function openSettingsDialog() {
    if (_settingDialogOpen) return;
    _settingDialogOpen = true;
    if (typeof layui === "undefined") {
      _settingDialogOpen = false;
      const v = prompt(
        "请输入倍速（如 1.5 / 2 / 3）：",
        GM_getValue("SPEED", 2),
      );
      if (v !== null && !isNaN(parseFloat(v))) {
        GM_setValue("SPEED", parseFloat(v));
        alert("已设置，刷新页面生效");
      }
      return;
    }
    layui.use("layer", function () {
      const layer = layui.layer;
      const curSpeed = GM_getValue("SPEED", 2);
      const curForce = GM_getValue("FORCE_SPEED", false);
      const confirmed = GM_getValue("XXT_CONFIRMED", false);
      layer.open({
        type: 1,
        title: "⚙ 脚本设置",
        area: ["340px", "auto"],
        skin: "xxt-layer",
        content: `
                <div style="padding:20px 20px 12px;font-family:'微软雅黑',sans-serif;font-size:13px">
                    <div style="margin-bottom:18px">
                        <div style="color:#555;margin-bottom:10px;font-weight:600">播放倍速</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
                            ${[1, 1.25, 1.5, 2, 3]
                              .map(
                                (s) =>
                                  `<button onclick="document.getElementById('xxt-sv').value=${s};[...document.querySelectorAll('.xxt-spd-q')].forEach(b=>b.style.background='#f5f5f5');this.style.background='#e0f2f1'"
                                    class="xxt-spd-q"
                                    style="padding:5px 13px;border:1px solid #ddd;border-radius:5px;cursor:pointer;background:${s == curSpeed ? "#e0f2f1" : "#f5f5f5"};font-size:13px;color:#333;transition:background .2s">${s}x</button>`,
                              )
                              .join("")}
                        </div>
                        <input id="xxt-sv" type="number" value="${curSpeed}" min="0.5" max="16" step="0.25"
                            style="width:100%;height:34px;border:1px solid #e0e0e0;border-radius:5px;padding:0 10px;font-size:13px;box-sizing:border-box;outline:none">
                    </div>
                    <div style="margin-bottom:16px">
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;color:#555;font-weight:600">
                            <input type="checkbox" id="xxt-fc" ${curForce ? "checked" : ""} style="width:15px;height:15px;accent-color:#00897b;cursor:pointer">
                            强制锁定倍速
                        </label>
                        <div style="color:#aaa;font-size:12px;margin-top:5px;padding-left:25px">开启后会拦截平台重置倍速的操作</div>
                    </div>
                    <div style="border-top:1px solid #f0f0f0;padding-top:12px;display:flex;justify-content:space-between;align-items:center">
                        <span style="color:#bbb;font-size:12px">修改设置后需刷新页面生效</span>
                        ${confirmed ? `<span id="xxt-reset-confirm" style="color:#ff9800;font-size:12px;cursor:pointer;text-decoration:underline">重置启动授权</span>` : ""}
                    </div>
                </div>
            `,
        btn: ["保存设置", "取消"],
        yes: function (idx) {
          const v = document.getElementById("xxt-sv").value;
          const fc = document.getElementById("xxt-fc").checked;
          if (v && !isNaN(parseFloat(v)) && parseFloat(v) > 0) {
            GM_setValue("SPEED", parseFloat(v));
          }
          GM_setValue("FORCE_SPEED", fc);
          layer.close(idx);
          layer.msg("设置已保存，刷新页面后生效", { icon: 1, time: 2000 });
          const speedEl = document.getElementById("xxt-speed");
          if (speedEl)
            speedEl.textContent = parseFloat(v) + "x" + (fc ? " (强制)" : "");
        },
        end: function () {
          _settingDialogOpen = false;
        },
      });
      // 重置授权点击
      setTimeout(() => {
        const resetBtn = document.getElementById("xxt-reset-confirm");
        if (resetBtn) {
          resetBtn.addEventListener("click", function () {
            GM_setValue("XXT_CONFIRMED", false);
            layer.msg("授权已重置，下次打开页面将重新显示确认框", {
              icon: 6,
              time: 2500,
            });
            this.textContent = "已重置 ✓";
            this.style.color = "#aaa";
            this.style.pointerEvents = "none";
          });
        }
      }, 100);
    });
  }

  // ========== Layui UI 面板结束 ==========

  function startScriptWithMask(mainFunc) {
    // 启动脚本，已授权则直接运行，否则显示确认对话框
    // 已授权过则跳过确认，直接运行
    if (GM_getValue("XXT_CONFIRMED", false)) {
      mainFunc();
      return;
    }
    if (typeof layui === "undefined") {
      // Layui 未加载时回退到原始方案
      const mask = document.createElement("div");
      mask.style.cssText =
        "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:9998;background:rgba(0,0,0,0);cursor:pointer";
      document.body.appendChild(mask);
      if (
        confirm(
          "本脚本仅供学习交流使用, 请遵守相关法律法规。\n\n请先关闭浏览器的开发者工具, 点击确定后单击页面任意处以运行脚本。\n\n如果想停止脚本, 随时刷新页面即可。",
        )
      ) {
        GM_setValue("XXT_CONFIRMED", true);
      }
      mask.addEventListener("click", function () {
        document.body.removeChild(mask);
        mainFunc();
      });
      return;
    }
    layui.use("layer", function () {
      const layer = layui.layer;
      layer.confirm(
        "<div style=\"font-family:'微软雅黑',sans-serif;line-height:1.9;padding:4px 0\">" +
          '<div style="font-size:15px;font-weight:700;margin-bottom:8px">🚀 学习通一键全自动刷课助手</div>' +
          '<div style="color:#666;font-size:13px">' +
          "⚠ 本脚本仅供学习交流使用，请遵守相关法律法规<br>" +
          "• 请先<b>关闭浏览器开发者工具</b>再启动<br>" +
          "• 如需停止脚本，刷新页面即可<br>" +
          '<span style="color:#aaa;font-size:12px">点击「开始运行」后将不再显示此提示</span>' +
          "</div></div>",
        {
          title: "启动确认",
          btn: ["开始运行", "取消"],
          icon: 0,
          area: "400px",
          skin: "xxt-layer",
        },
        function (index) {
          layer.close(index);
          GM_setValue("XXT_CONFIRMED", true);
          mainFunc();
        },
      );
    });
  }

  function main() {
    console.log("脚本已启动, 开始刷课...");

    const leftEl = document.querySelector(IFRAME_MAIN_FEATURE_CLASS);
    if (leftEl) {
      const leftObserver = new MutationObserver(() => {
        skipSign++;
        if (skipSign % 2 === 0) {
          handleIframeLock = false; // 每次检测到变动后解锁
          handleIframeChange(3);
        }
      });
      leftObserver.observe(leftEl, { childList: true, subtree: true });
      handleIframeChange(3);
    } else {
      console.error("未找到 class 为 lefaramt 的元素");
    }
  }

  Object.defineProperty(document, "visibilityState", { get: () => "visible" });
  Object.defineProperty(document, "hidden", { get: () => false });

  document.addEventListener(
    "visibilitychange",
    function (e) {
      e.stopImmediatePropagation();
    },
    true,
  );

  window.onblur = null;
  window.onfocus = null;
  window.addEventListener = new Proxy(window.addEventListener, {
    apply(target, thisArg, args) {
      if (["blur", "focus"].includes(args[0])) return;
      return Reflect.apply(target, thisArg, args);
    },
  });

  findCourseTree(); // 初始化课程树
  initializeTreeIndex();
  createStatusPanel(); // 创建 Layui 状态面板

  if (DEFAULT_SPEED_OPTION) {
    console.log("强制速度模式已开启,目前倍速为:", DEFAULT_SPEED);
  } else {
    console.log("未开启强制速度模式");
  }

  // 启动入口
  startScriptWithMask(main);
})();
