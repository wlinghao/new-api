package controller

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

const usageDateLayout = "2006-01-02"
const usageTokenMillionUnit = 1000000

type refreshUserUsageDailyRequest struct {
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Mode      string `json:"mode"`
}

func parseUsageDay(value string) (int64, error) {
	t, err := time.ParseInLocation(usageDateLayout, value, time.Local)
	if err != nil {
		return 0, err
	}
	return t.Unix(), nil
}

func usageTodayStart() int64 {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local).Unix()
}

func formatUsageTokensMillion(tokens float64) string {
	value := strconv.FormatFloat(tokens/usageTokenMillionUnit, 'f', 6, 64)
	value = strings.TrimRight(strings.TrimRight(value, "0"), ".")
	if value == "" || value == "-0" {
		value = "0"
	}
	return value + "M"
}

func usageDefaultDateRange(c *gin.Context) (int64, int64, error) {
	today := usageTodayStart()
	startValue := c.Query("start_date")
	endValue := c.Query("end_date")
	if startValue == "" {
		startValue = time.Unix(today-29*86400, 0).In(time.Local).Format(usageDateLayout)
	}
	if endValue == "" {
		endValue = time.Unix(today, 0).In(time.Local).Format(usageDateLayout)
	}
	startDate, err := parseUsageDay(startValue)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid start_date")
	}
	endDate, err := parseUsageDay(endValue)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid end_date")
	}
	if endDate < startDate {
		return 0, 0, fmt.Errorf("end_date must be greater than or equal to start_date")
	}
	return startDate, endDate, nil
}

func buildUsageSummaryQuery(c *gin.Context) (model.UserUsageSummaryQuery, error) {
	startDate, endDate, err := usageDefaultDateRange(c)
	if err != nil {
		return model.UserUsageSummaryQuery{}, err
	}
	return model.UserUsageSummaryQuery{
		StartDate: startDate,
		EndDate:   endDate,
		Username:  c.Query("username"),
	}, nil
}

func GetUserUsageSummary(c *gin.Context) {
	query, err := buildUsageSummaryQuery(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	pageInfo := common.GetPageQuery(c)
	rows, total, err := model.GetUserUsageSummaries(query, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}

func GetUserUsageModelSummary(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid user_id"})
		return
	}
	query, err := buildUsageSummaryQuery(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	rows, err := model.GetUserUsageModelSummaries(userId, query)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

func RefreshUserUsageDaily(c *gin.Context) {
	var req refreshUserUsageDailyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid request body"})
		return
	}
	today := usageTodayStart()
	force := false
	var startDate int64
	var endDate int64
	var err error

	switch req.Mode {
	case "today":
		startDate = today
		endDate = today
		force = true
	case "force":
		force = true
		fallthrough
	default:
		if req.StartDate == "" {
			req.StartDate = time.Unix(today-29*86400, 0).In(time.Local).Format(usageDateLayout)
		}
		if req.EndDate == "" {
			req.EndDate = time.Unix(today, 0).In(time.Local).Format(usageDateLayout)
		}
		startDate, err = parseUsageDay(req.StartDate)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid start_date"})
			return
		}
		endDate, err = parseUsageDay(req.EndDate)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid end_date"})
			return
		}
	}

	if endDate < startDate {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "end_date must be greater than or equal to start_date"})
		return
	}
	if endDate-startDate > 366*86400 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "date range cannot exceed 366 days"})
		return
	}

	result, err := model.RefreshUserUsageDaily(startDate, endDate, force)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func ExportUserUsageSummaryCSV(c *gin.Context) {
	query, err := buildUsageSummaryQuery(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	rows, _, err := model.GetUserUsageSummaries(query, 0, 0)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	filename := fmt.Sprintf("user-usage-%s-%s.csv",
		time.Unix(query.StartDate, 0).In(time.Local).Format(usageDateLayout),
		time.Unix(query.EndDate, 0).In(time.Local).Format(usageDateLayout),
	)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	_ = writer.Write([]string{
		"User ID",
		"Username",
		"Active Days",
		"Request Count",
		"Prompt Tokens",
		"Completion Tokens",
		"Average Prompt Tokens Per Day",
		"Average Completion Tokens Per Day",
		"Quota",
		"Amount USD",
		"Average Amount USD Per Day",
		"First Date",
		"Last Date",
		"Display Currency",
	})
	displayCurrency := operation_setting.GetQuotaDisplayType()
	for _, row := range rows {
		amountUSD := float64(row.Quota) / common.QuotaPerUnit
		avgAmountUSD := row.AvgQuotaPerDay / common.QuotaPerUnit
		_ = writer.Write([]string{
			strconv.Itoa(row.UserId),
			row.Username,
			strconv.FormatInt(row.ActiveDays, 10),
			strconv.FormatInt(row.RequestCount, 10),
			formatUsageTokensMillion(float64(row.PromptTokens)),
			formatUsageTokensMillion(float64(row.CompletionTokens)),
			formatUsageTokensMillion(row.AvgPromptTokensPerDay),
			formatUsageTokensMillion(row.AvgCompletionTokensPerDay),
			strconv.FormatInt(row.Quota, 10),
			strconv.FormatFloat(amountUSD, 'f', 6, 64),
			strconv.FormatFloat(avgAmountUSD, 'f', 6, 64),
			time.Unix(row.FirstDate, 0).In(time.Local).Format(usageDateLayout),
			time.Unix(row.LastDate, 0).In(time.Local).Format(usageDateLayout),
			displayCurrency,
		})
	}
}
