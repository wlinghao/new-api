package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	UserUsageDailySyncStatusSynced = "synced"
	UserUsageDailySyncStatusFailed = "failed"
)

type UserUsageDaily struct {
	Id               int    `json:"id"`
	StatDate         int64  `json:"stat_date" gorm:"bigint;uniqueIndex:idx_user_usage_daily_identity,priority:1;index"`
	UserId           int    `json:"user_id" gorm:"uniqueIndex:idx_user_usage_daily_identity,priority:2;index"`
	Username         string `json:"username" gorm:"size:64;index;default:''"`
	ModelName        string `json:"model_name" gorm:"size:255;uniqueIndex:idx_user_usage_daily_identity,priority:3;index;default:''"`
	RequestCount     int64  `json:"request_count" gorm:"default:0"`
	PromptTokens     int64  `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens int64  `json:"completion_tokens" gorm:"default:0"`
	Quota            int64  `json:"quota" gorm:"default:0"`
	CreatedAt        int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        int64  `json:"updated_at" gorm:"autoUpdateTime"`
}

func (UserUsageDaily) TableName() string {
	return "user_usage_daily"
}

type UserUsageDailySync struct {
	Id        int    `json:"id"`
	StatDate  int64  `json:"stat_date" gorm:"bigint;uniqueIndex;index"`
	Status    string `json:"status" gorm:"size:32;default:'synced'"`
	RowCount  int    `json:"row_count" gorm:"default:0"`
	Message   string `json:"message" gorm:"type:text"`
	SyncedAt  int64  `json:"synced_at" gorm:"bigint;index"`
	CreatedAt int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt int64  `json:"updated_at" gorm:"autoUpdateTime"`
}

func (UserUsageDailySync) TableName() string {
	return "user_usage_daily_syncs"
}

type UserUsageSummaryQuery struct {
	StartDate int64
	EndDate   int64
	Username  string
}

type UserUsageSummary struct {
	UserId                    int     `json:"user_id" gorm:"column:user_id"`
	Username                  string  `json:"username" gorm:"column:username"`
	ActiveDays                int64   `json:"active_days" gorm:"column:active_days"`
	RequestCount              int64   `json:"request_count" gorm:"column:request_count"`
	PromptTokens              int64   `json:"prompt_tokens" gorm:"column:prompt_tokens"`
	CompletionTokens          int64   `json:"completion_tokens" gorm:"column:completion_tokens"`
	Quota                     int64   `json:"quota" gorm:"column:quota"`
	FirstDate                 int64   `json:"first_date" gorm:"column:first_date"`
	LastDate                  int64   `json:"last_date" gorm:"column:last_date"`
	AvgPromptTokensPerDay     float64 `json:"avg_prompt_tokens_per_day" gorm:"-"`
	AvgCompletionTokensPerDay float64 `json:"avg_completion_tokens_per_day" gorm:"-"`
	AvgQuotaPerDay            float64 `json:"avg_quota_per_day" gorm:"-"`
}

type UserUsageModelSummary struct {
	ModelName                 string  `json:"model_name" gorm:"column:model_name"`
	ActiveDays                int64   `json:"active_days" gorm:"column:active_days"`
	RequestCount              int64   `json:"request_count" gorm:"column:request_count"`
	PromptTokens              int64   `json:"prompt_tokens" gorm:"column:prompt_tokens"`
	CompletionTokens          int64   `json:"completion_tokens" gorm:"column:completion_tokens"`
	Quota                     int64   `json:"quota" gorm:"column:quota"`
	AvgPromptTokensPerDay     float64 `json:"avg_prompt_tokens_per_day" gorm:"-"`
	AvgCompletionTokensPerDay float64 `json:"avg_completion_tokens_per_day" gorm:"-"`
	AvgQuotaPerDay            float64 `json:"avg_quota_per_day" gorm:"-"`
}

type UserUsageDailyRefreshResult struct {
	ProcessedDates  int     `json:"processed_dates"`
	SkippedDates    int     `json:"skipped_dates"`
	RowsWritten     int     `json:"rows_written"`
	RefreshedDates  []int64 `json:"refreshed_dates"`
	SkippedDateList []int64 `json:"skipped_date_list"`
}

func usageSummaryBase(query UserUsageSummaryQuery) (*gorm.DB, error) {
	tx := DB.Model(&UserUsageDaily{}).
		Where("stat_date >= ? AND stat_date <= ?", query.StartDate, query.EndDate)
	if query.Username != "" {
		var err error
		tx, err = applyExplicitLogTextFilter(tx, "username", query.Username)
		if err != nil {
			return nil, err
		}
	}
	return tx, nil
}

func groupedUsageSummaryQuery(query UserUsageSummaryQuery) (*gorm.DB, error) {
	tx, err := usageSummaryBase(query)
	if err != nil {
		return nil, err
	}
	return tx.Select(`user_id, username,
		COUNT(DISTINCT stat_date) AS active_days,
		SUM(request_count) AS request_count,
		SUM(prompt_tokens) AS prompt_tokens,
		SUM(completion_tokens) AS completion_tokens,
		SUM(quota) AS quota,
		MIN(stat_date) AS first_date,
		MAX(stat_date) AS last_date`).
		Group("user_id, username"), nil
}

func fillUserUsageSummaryAverages(rows []UserUsageSummary) {
	for i := range rows {
		if rows[i].ActiveDays <= 0 {
			continue
		}
		days := float64(rows[i].ActiveDays)
		rows[i].AvgPromptTokensPerDay = float64(rows[i].PromptTokens) / days
		rows[i].AvgCompletionTokensPerDay = float64(rows[i].CompletionTokens) / days
		rows[i].AvgQuotaPerDay = float64(rows[i].Quota) / days
	}
}

func GetUserUsageSummaries(query UserUsageSummaryQuery, offset int, limit int) ([]UserUsageSummary, int64, error) {
	groupedForCount, err := groupedUsageSummaryQuery(query)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	if err := DB.Table("(?) AS usage_users", groupedForCount).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	grouped, err := groupedUsageSummaryQuery(query)
	if err != nil {
		return nil, 0, err
	}
	var rows []UserUsageSummary
	grouped = grouped.Order("SUM(quota) DESC, SUM(prompt_tokens) + SUM(completion_tokens) DESC")
	if limit > 0 {
		grouped = grouped.Limit(limit).Offset(offset)
	}
	if err := grouped.Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	fillUserUsageSummaryAverages(rows)
	return rows, total, nil
}

func GetUserUsageModelSummaries(userId int, query UserUsageSummaryQuery) ([]UserUsageModelSummary, error) {
	tx := DB.Model(&UserUsageDaily{}).
		Where("user_id = ? AND stat_date >= ? AND stat_date <= ?", userId, query.StartDate, query.EndDate)
	var rows []UserUsageModelSummary
	if err := tx.Select(`model_name,
		COUNT(DISTINCT stat_date) AS active_days,
		SUM(request_count) AS request_count,
		SUM(prompt_tokens) AS prompt_tokens,
		SUM(completion_tokens) AS completion_tokens,
		SUM(quota) AS quota`).
		Group("model_name").
		Order("SUM(quota) DESC, SUM(prompt_tokens) + SUM(completion_tokens) DESC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		if rows[i].ActiveDays <= 0 {
			continue
		}
		days := float64(rows[i].ActiveDays)
		rows[i].AvgPromptTokensPerDay = float64(rows[i].PromptTokens) / days
		rows[i].AvgCompletionTokensPerDay = float64(rows[i].CompletionTokens) / days
		rows[i].AvgQuotaPerDay = float64(rows[i].Quota) / days
	}
	return rows, nil
}

func hasSyncedUserUsageDate(statDate int64) (bool, error) {
	var sync UserUsageDailySync
	err := DB.Where("stat_date = ? AND status = ?", statDate, UserUsageDailySyncStatusSynced).First(&sync).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return err == nil, err
}

func rebuildUserUsageDailyForDate(statDate int64) (int, error) {
	start := statDate
	end := statDate + 86400
	var rows []UserUsageDaily
	err := LOG_DB.Table("logs").
		Select(fmt.Sprintf(`%d AS stat_date,
			user_id,
			username,
			model_name,
			COUNT(*) AS request_count,
			COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
			COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
			COALESCE(SUM(quota), 0) AS quota`, statDate)).
		Where("type = ? AND user_id > 0 AND created_at >= ? AND created_at < ?", LogTypeConsume, start, end).
		Group("user_id, username, model_name").
		Scan(&rows).Error
	if err != nil {
		return 0, err
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("stat_date = ?", statDate).Delete(&UserUsageDaily{}).Error; err != nil {
			return err
		}
		if len(rows) > 0 {
			if err := tx.CreateInBatches(rows, 500).Error; err != nil {
				return err
			}
		}

		sync := UserUsageDailySync{
			StatDate: statDate,
			Status:   UserUsageDailySyncStatusSynced,
			RowCount: len(rows),
			Message:  "",
			SyncedAt: time.Now().Unix(),
		}
		var existing UserUsageDailySync
		err := tx.Where("stat_date = ?", statDate).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return tx.Create(&sync).Error
		}
		if err != nil {
			return err
		}
		return tx.Model(&existing).Updates(map[string]interface{}{
			"status":    sync.Status,
			"row_count": sync.RowCount,
			"message":   sync.Message,
			"synced_at": sync.SyncedAt,
		}).Error
	})
	if err != nil {
		_ = markUserUsageDailySyncFailed(statDate, err.Error())
		return 0, err
	}
	return len(rows), nil
}

func markUserUsageDailySyncFailed(statDate int64, message string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		sync := UserUsageDailySync{
			StatDate: statDate,
			Status:   UserUsageDailySyncStatusFailed,
			Message:  message,
			SyncedAt: time.Now().Unix(),
		}
		var existing UserUsageDailySync
		err := tx.Where("stat_date = ?", statDate).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return tx.Create(&sync).Error
		}
		if err != nil {
			return err
		}
		return tx.Model(&existing).Updates(map[string]interface{}{
			"status":    sync.Status,
			"message":   sync.Message,
			"synced_at": sync.SyncedAt,
		}).Error
	})
}

func RefreshUserUsageDaily(startDate int64, endDate int64, force bool) (UserUsageDailyRefreshResult, error) {
	result := UserUsageDailyRefreshResult{
		RefreshedDates:  make([]int64, 0),
		SkippedDateList: make([]int64, 0),
	}
	for statDate := startDate; statDate <= endDate; statDate += 86400 {
		if !force {
			synced, err := hasSyncedUserUsageDate(statDate)
			if err != nil {
				return result, err
			}
			if synced {
				result.SkippedDates++
				result.SkippedDateList = append(result.SkippedDateList, statDate)
				continue
			}
		}
		rows, err := rebuildUserUsageDailyForDate(statDate)
		if err != nil {
			return result, err
		}
		result.ProcessedDates++
		result.RowsWritten += rows
		result.RefreshedDates = append(result.RefreshedDates, statDate)
	}
	return result, nil
}

func nextUserUsageDailyRunDelay() time.Duration {
	now := time.Now()
	next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 10, 0, 0, time.Local)
	return time.Until(next)
}

func StartUserUsageDailyTask() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		refreshYesterday := func() {
			today := time.Now()
			todayStart := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.Local).Unix()
			yesterday := todayStart - 86400
			result, err := RefreshUserUsageDaily(yesterday, yesterday, false)
			if err != nil {
				common.SysError("failed to update user usage daily statistics: " + err.Error())
				return
			}
			common.SysLog("user usage daily statistics updated, processed dates: " +
				fmt.Sprintf("%d, skipped dates: %d, rows written: %d", result.ProcessedDates, result.SkippedDates, result.RowsWritten))
		}

		refreshYesterday()
		for {
			timer := time.NewTimer(nextUserUsageDailyRunDelay())
			<-timer.C
			refreshYesterday()
		}
	}()
}
