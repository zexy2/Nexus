/**
 * Copy for run cancellation, live run phases and in-app notifications.
 * Merged into `messages` (see messages.ts) as the `runs` and `notifications`
 * namespaces; the parity test covers these keys like any other.
 */

export const runMessages = {
  tr: {
    runs: {
      status: {
        cancelled: "İptal edildi",
        cancelling: "İptal ediliyor…",
      },
      cancel: "Çalışmayı iptal et",
      cancelShort: "İptal et",
      cancelConfirmTitle: "Bu çalışma iptal edilsin mi?",
      cancelConfirmDesc:
        "Yapay zekâ çalışması durdurulur. Bekleyen bir plan incelemesi varsa kapatılır ve belge yeni analizlere açılır. Tamamlanmış adımlar geri alınmaz.",
      cancelKeep: "Devam etsin",
      cancelRequested: "İptal istendi. Temizlik bitince durum güncellenecek.",
      cancelForbidden: "Bu çalışmayı yalnızca başlatan kişi veya çalışma alanı yöneticisi iptal edebilir.",
      cancelAlreadyFinished: "Bu çalışma zaten tamamlandı.",
      cancelFailed: "Çalışma iptal edilemedi. Lütfen tekrar deneyin.",
      cancelledMessage: "Çalışma iptal edildi.",
      retryAttempt: "{n}. deneme",
      phase: {
        searching: "Çalışma alanı belgeleri aranıyor",
        researching: "Araştırılıyor",
        writing: "Belge yazılıyor",
        planning: "Görevler çıkarılıyor",
        coding: "Kod üretiliyor",
        analyzing: "Plan etkisi analiz ediliyor",
        saving: "Sonuç kaydediliyor",
        applying: "Değişiklikler uygulanıyor",
        externalWrites: "Dış sistemlere yazılıyor",
        awaitingReview: "İncelemeniz bekleniyor",
        cancelling: "İptal temizliği yapılıyor",
      },
      changeSet: {
        status: "İptal edildi",
        resolvedTitle: "Analiz iptal edildi",
        resolvedDesc:
          "Bu inceleme, analiz çalışması iptal edildiği için kapatıldı. Hiçbir görev değişmedi; planı yeniden analiz edebilirsiniz.",
      },
    },
    notifications: {
      title: "Bildirimler",
      open: "Bildirimleri aç",
      unreadCount: "{n} okunmamış bildirim",
      empty: "Henüz bildirim yok.",
      markAllRead: "Tümünü okundu işaretle",
      loadError: "Bildirimler yüklenemedi.",
      workflowFallback: "İş akışı",
      type: {
        workflow_completed: "{name} tamamlandı",
        workflow_failed: "{name} başarısız oldu",
        workflow_cancelled: "{name} iptal edildi",
        plan_review_pending: "Plan etki incelemesi hazır",
      },
      desc: {
        workflow_completed: "Sonuçlar iş akışı merkezinde.",
        workflow_failed: "Ayrıntılar için iş akışı merkezine bakın.",
        workflow_cancelled: "Çalışma durduruldu ve temizlendi.",
        plan_review_pending: "Önerilen değişiklikleri inceleyip onaylayın veya reddedin.",
      },
    },
  },
  en: {
    runs: {
      status: {
        cancelled: "Cancelled",
        cancelling: "Cancelling…",
      },
      cancel: "Cancel run",
      cancelShort: "Cancel",
      cancelConfirmTitle: "Cancel this run?",
      cancelConfirmDesc:
        "The AI run stops. If a plan review is pending it is closed and the document is unlocked for new analyses. Completed steps are not rolled back.",
      cancelKeep: "Keep running",
      cancelRequested: "Cancellation requested. The status updates once cleanup finishes.",
      cancelForbidden: "Only the person who started this run or a workspace admin can cancel it.",
      cancelAlreadyFinished: "This run has already finished.",
      cancelFailed: "Could not cancel the run. Please try again.",
      cancelledMessage: "The run was cancelled.",
      retryAttempt: "attempt {n}",
      phase: {
        searching: "Searching workspace documents",
        researching: "Researching",
        writing: "Writing the document",
        planning: "Breaking down tasks",
        coding: "Generating code",
        analyzing: "Analyzing plan impact",
        saving: "Saving the result",
        applying: "Applying changes",
        externalWrites: "Writing to external systems",
        awaitingReview: "Waiting for your review",
        cancelling: "Cleaning up after cancel",
      },
      changeSet: {
        status: "Cancelled",
        resolvedTitle: "Analysis cancelled",
        resolvedDesc:
          "This review was closed because its analysis run was cancelled. No tasks changed; you can analyze the plan again.",
      },
    },
    notifications: {
      title: "Notifications",
      open: "Open notifications",
      unreadCount: "{n} unread notifications",
      empty: "No notifications yet.",
      markAllRead: "Mark all as read",
      loadError: "Could not load notifications.",
      workflowFallback: "Workflow",
      type: {
        workflow_completed: "{name} finished",
        workflow_failed: "{name} failed",
        workflow_cancelled: "{name} was cancelled",
        plan_review_pending: "Plan impact review is ready",
      },
      desc: {
        workflow_completed: "Results are in the workflow center.",
        workflow_failed: "See the workflow center for details.",
        workflow_cancelled: "The run was stopped and cleaned up.",
        plan_review_pending: "Review the proposed changes, then apply or reject them.",
      },
    },
  },
} as const;
