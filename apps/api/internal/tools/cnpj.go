package tools

import (
	"fmt"
	"math/rand"
	"regexp"
	"strconv"
)

var cnpjWeights1 = []int{5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
var cnpjWeights2 = []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}

func ValidarCNPJ(value string) bool {
	re := regexp.MustCompile(`\D`)
	digits := re.ReplaceAllString(value, "")
	if len(digits) != 14 {
		return false
	}
	if allSameDigits(digits) {
		return false
	}
	nums := make([]int, 14)
	for i, c := range digits {
		nums[i] = int(c - '0')
	}
	d1 := cpfCalcDigit(nums[:12], cnpjWeights1)
	d2 := cpfCalcDigit(nums[:13], cnpjWeights2)
	return nums[12] == d1 && nums[13] == d2
}

func GerarCNPJ() string {
	base := make([]int, 8)
	for i := range base {
		base[i] = rand.Intn(10)
	}
	all := append(base, 0, 0, 0, 1)
	d1 := cpfCalcDigit(all, cnpjWeights1)
	all = append(all, d1)
	d2 := cpfCalcDigit(all, cnpjWeights2)
	all = append(all, d2)
	s := ""
	for _, n := range all {
		s += strconv.Itoa(n)
	}
	return fmt.Sprintf("%s.%s.%s/%s-%s", s[0:2], s[2:5], s[5:8], s[8:12], s[12:14])
}
