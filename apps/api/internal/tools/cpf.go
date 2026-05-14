package tools

import (
	"fmt"
	"math/rand"
	"regexp"
)

func cpfCalcDigit(digits []int, weights []int) int {
	sum := 0
	for i, d := range digits {
		sum += d * weights[i]
	}
	rem := sum % 11
	if rem < 2 {
		return 0
	}
	return 11 - rem
}

// allSameDigits returns true when every character in s is identical.
// Go's regexp/RE2 does not support backreferences, so we check manually.
func allSameDigits(s string) bool {
	if len(s) == 0 {
		return false
	}
	first := s[0]
	for i := 1; i < len(s); i++ {
		if s[i] != first {
			return false
		}
	}
	return true
}

func ValidarCPF(value string) bool {
	re := regexp.MustCompile(`\D`)
	digits := re.ReplaceAllString(value, "")
	if len(digits) != 11 {
		return false
	}
	if allSameDigits(digits) {
		return false
	}
	nums := make([]int, 11)
	for i, c := range digits {
		nums[i] = int(c - '0')
	}
	d1 := cpfCalcDigit(nums[:9], []int{10, 9, 8, 7, 6, 5, 4, 3, 2})
	d2 := cpfCalcDigit(nums[:10], []int{11, 10, 9, 8, 7, 6, 5, 4, 3, 2})
	return nums[9] == d1 && nums[10] == d2
}

func GerarCPF() string {
	d := make([]int, 9)
	for i := range d {
		d[i] = rand.Intn(10)
	}
	d1 := cpfCalcDigit(d, []int{10, 9, 8, 7, 6, 5, 4, 3, 2})
	d = append(d, d1)
	d2 := cpfCalcDigit(d, []int{11, 10, 9, 8, 7, 6, 5, 4, 3, 2})
	d = append(d, d2)
	return fmt.Sprintf("%d%d%d.%d%d%d.%d%d%d-%d%d",
		d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10])
}
