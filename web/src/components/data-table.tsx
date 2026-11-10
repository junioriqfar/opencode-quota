import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  showRowNumber?: boolean;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  empty?: ReactNode;
  footerRow?: ReactNode;
  toolbar?: ReactNode;
  className?: string;
}

function pageList(current: number, total: number): Array<number | "ellipsis-start" | "ellipsis-end"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: Array<number | "ellipsis-start" | "ellipsis-end"> = [];
  for (const page of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      result.push(previous === 1 ? "ellipsis-start" : "ellipsis-end");
    }
    result.push(page);
  }
  return result;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  showRowNumber = false,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
  empty,
  footerRow,
  toolbar,
  className,
}: DataTableProps<T>) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize]);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column?.sortValue) return rows;
    const sorted = [...rows].sort((left, right) => {
      const a = column.sortValue!(left);
      const b = column.sortValue!(right);
      if (typeof a === "number" && typeof b === "number") return a - b;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    });
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, sort, columns]);

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sortedRows.slice(start, start + pageSize);
  const columnCount = columns.length + (showRowNumber ? 1 : 0);

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => setPageSize(Number.parseInt(value, 10))}
          >
            <SelectTrigger className="!h-9 w-[80px] text-xs" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>
        {toolbar}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {showRowNumber && <TableHead className="w-12 text-center">#</TableHead>}
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const SortIcon = !active ? ArrowUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <TableHead key={column.key} className={column.headerClassName}>
                  {column.sortValue ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide"
                      onClick={() => toggleSort(column.key)}
                      aria-label={`Sort by ${typeof column.header === "string" ? column.header : column.key}`}
                    >
                      {column.header}
                      <SortIcon className="h-3 w-3" />
                    </Button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-10 text-center text-sm text-muted-foreground">
                {empty ?? "No data yet."}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row, index) => (
              <TableRow key={rowKey(row)}>
                {showRowNumber && (
                  <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                    {start + index + 1}
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {footerRow && <TableFooter>{footerRow}</TableFooter>}
      </Table>

      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} of {total} data
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="!h-9 !w-9"
            disabled={currentPage === 1}
            onClick={() => setPage(1)}
            aria-label="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="!h-9 !w-9"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageList(currentPage, totalPages).map((entry) =>
            typeof entry === "number" ? (
              <Button
                key={entry}
                type="button"
                variant={entry === currentPage ? "default" : "ghost"}
                size="icon"
                className="!h-9 !w-9 text-xs"
                onClick={() => setPage(entry)}
                aria-label={`Page ${entry}`}
                aria-current={entry === currentPage ? "page" : undefined}
              >
                {entry}
              </Button>
            ) : (
              <span key={entry} className="px-1">
                …
              </span>
            ),
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="!h-9 !w-9"
            disabled={currentPage === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="!h-9 !w-9"
            disabled={currentPage === totalPages}
            onClick={() => setPage(totalPages)}
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
